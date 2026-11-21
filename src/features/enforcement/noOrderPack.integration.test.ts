import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documentVersions, files, violationNotices } from '@/db/schema'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { EVERY_CASE_ABILITY } from '@/features/enforcement/caseNextStep'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { referToCounsel } from '@/features/enforcement/counsel'
import { recordFinding } from '@/features/enforcement/findings'
import { recordNoticeReceipt } from '@/features/enforcement/notices'
import { draftOrder } from '@/features/enforcement/orders'
import { planCaseWork } from '@/features/enforcement/workPlan'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { sendFixtureNotice } from '@/test/enforcementNoticeFixture'
import { makeTestStore } from '@/test/objectStore'
import { XX_NO_ORDERS } from '@/test/packs/xx/noOrders'
import { XX_NO_BUILDING } from '@/test/packs/xx/variants'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

type Kind = 'zoning_ordinance' | 'building_code'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const TODAY = d('2027-03-12')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld

beforeEach(async () => {
  setActivePackForTest(XX_NO_ORDERS)
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function investigatingCase(): Promise<string> {
  const opened = await openCase(handle.db, world.staff, { locationText: '14 Birch Lane' }, signal)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    world.staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  return caseId
}

function finding(caseId: string, kind: Kind) {
  return recordFinding(
    handle.db,
    world.staff,
    {
      caseId,
      provisionKind: kind,
      provisionRef: kind === 'building_code' ? 'Vellmora Code A 105.1' : 'Zoning Section 4.2',
      facts: 'A garage was built without a permit.',
      inspectionDate: '2027-02-20',
    },
    signal,
    FIXTURE_NOW,
  )
}

async function foundCase(kind: Kind = 'zoning_ordinance') {
  const caseId = await investigatingCase()
  const made = await finding(caseId, kind)
  if (!made.ok) throw new Error(made.error)
  return { caseId, findingId: made.value.findingId }
}

function draft(caseId: string, ...findingIds: string[]) {
  return draftOrder(
    handle.db,
    world.staff,
    {
      caseId,
      findingIds,
      correctiveAction: 'Remove the garage.',
      correctiveDeadline: '2027-04-01',
      ceaseImmediately: false,
    },
    signal,
  )
}

async function noticedCase(): Promise<string> {
  const { caseId, findingId } = await foundCase()
  await sendFixtureNotice(handle.db, store, world.staff, {
    caseId,
    findingId,
    sentOn: '2027-03-01',
  })
  const [notice] = await handle.db
    .select()
    .from(violationNotices)
    .where(eq(violationNotices.caseId, caseId))
  const received = await recordNoticeReceipt(
    handle.db,
    world.staff,
    { noticeId: notice?.id ?? '', receivedOn: '2027-03-02', basis: 'Signed for in hand.' },
    signal,
  )
  if (!received.ok) throw new Error(received.error)
  return caseId
}

async function detailOf(caseId: string) {
  const detail = await loadCaseDetail(handle.db, world.staff, caseId, TODAY, signal)
  if (!detail.ok) throw new Error(detail.error)
  return detail.value
}

async function packetText(documentId: string): Promise<string> {
  const [version] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [file] = await handle.db
    .select()
    .from(files)
    .where(eq(files.sha256, version?.fileSha256 ?? ''))
  const stream = await store.getStream(file?.storageKey ?? '', signal)
  if (!stream.ok) throw new Error('bytes')
  const text = await pdfText(new Uint8Array(await new Response(stream.value).arrayBuffer()))
  return text.replace(/\n/g, ' ')
}

describe('a pack with no statutory order', () => {
  it('refuses to draft an order on zoning findings', async () => {
    const { caseId, findingId } = await foundCase()
    expect(await draft(caseId, findingId)).toEqual({ ok: false, error: 'order_not_available' })
  })

  it('records a building code finding while a code is enforced, with no order for it', async () => {
    const { caseId, findingId } = await foundCase('building_code')
    expect((await detailOf(caseId)).findings.map((f) => f.provisionKind)).toEqual(['building_code'])
    expect(await draft(caseId, findingId)).toEqual({ ok: false, error: 'order_not_available' })
  })

  it('refuses a mixed draft as having no order rather than needing a split', async () => {
    const { caseId, findingId } = await foundCase('building_code')
    const zoning = await finding(caseId, 'zoning_ordinance')
    if (!zoning.ok) throw new Error(zoning.error)
    expect(await draft(caseId, findingId, zoning.value.findingId)).toEqual({
      ok: false,
      error: 'order_not_available',
    })
  })

  it('leaves the order step out of the work plan and the queue', async () => {
    const caseId = await noticedCase()
    const detail = await detailOf(caseId)
    expect(detail.staff.row.status).toBe('violation_found')
    const plan = planCaseWork(detail, { abilities: EVERY_CASE_ABILITY, responsible: null })
    expect(plan.now?.key).not.toMatch(/^order\./)
    expect(plan.now?.action?.kind).not.toBe('draft_order')
    expect(plan.remedies.map((a) => a.kind)).not.toContain('draft_order')
    const rows = plan.groups.flatMap((g) => g.rows.map((r) => r.key))
    expect(rows).toEqual(expect.arrayContaining(['finding', 'notice.sent', 'notice.received']))
    expect(rows.filter((key) => key.startsWith('order.'))).toEqual([])
    expect(plan.groups.map((g) => g.title).join(' ')).not.toContain('order')
    const queue = await listCaseQueue(
      handle.db,
      world.staff,
      { filters: {}, limit: 50, offset: 0 },
      TODAY,
      signal,
    )
    const row = queue.rows.find((r) => r.caseId === caseId)
    expect(row?.nextStep).toEqual({ actor: 'Town', ask: 'refer the case to town counsel' })
  })

  it('shows the pack penalty range with no amount and no accrual start', async () => {
    const caseId = await noticedCase()
    const { exposure } = await detailOf(caseId)
    expect(exposure).toMatchObject({ kind: 'range', fromDate: null, days: 0 })
    expect(exposure).not.toHaveProperty('cents')
    expect(exposure?.kind === 'range' ? exposure.categories.map((c) => c.key) : []).toEqual([
      'no_permit',
      'specific',
    ])
  })

  it('puts the pack penalty range in the counsel packet', async () => {
    const caseId = await noticedCase()
    const referred = await referToCounsel(
      handle.db,
      store,
      world.staff,
      { caseId, counselName: 'Attorney Rivera', purpose: 'penalty_action', referredOn: TODAY },
      signal,
      new Date('2027-03-12T15:00:00Z'),
    )
    if (!referred.ok) throw new Error(referred.error)
    const text = await packetText(referred.value.packetDocumentId)
    expect(text).toContain('Statutory range, set by the court')
    expect(text).toContain('No permit: $100.00 to $2,500.00 per day')
    expect(text).toContain('Accrual began None recorded')
    expect(text).not.toContain('Not started')
    expect(text).not.toContain('Estimated exposure')
  })
})

describe('a pack with no building codes', () => {
  it('still refuses a building code finding', async () => {
    setActivePackForTest(XX_NO_BUILDING)
    const caseId = await investigatingCase()
    expect(await finding(caseId, 'building_code')).toEqual({
      ok: false,
      error: 'building_code_not_enforced',
    })
  })
})
