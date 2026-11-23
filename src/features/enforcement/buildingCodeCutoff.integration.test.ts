import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configVersions, enforcementCases, enforcementOrders, violationFindings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { editFinding } from '@/features/enforcement/findingChanges'
import { recordFinding } from '@/features/enforcement/findings'
import { draftOrder, issueOrder, reviseDraftOrder } from '@/features/enforcement/orders'
import { loadSectionListView } from '@/features/enforcement/sections/sectionListView'
import { setActivePackForTest } from '@/features/packs/registry'
import type { ObjectStore } from '@/features/storage/objectStore'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { sendFixtureNotice } from '@/test/enforcementNoticeFixture'
import { makeTestStore } from '@/test/objectStore'
import { XX_NO_BUILDING } from '@/test/packs/xx/variants'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

type Kind = 'zoning_ordinance' | 'building_code'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const d = (s: string) => s as CivilDate
let handle: TestDb
let store: ObjectStore
let staff: Actor
let admin: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  staff = await staffActor(handle.db, 'staff')
  admin = await staffActor(handle.db, 'admin')
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function investigatingCase(): Promise<string> {
  const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal, NOW)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  return caseId
}

function findingInput(caseId: string, kind: Kind) {
  return {
    caseId,
    provisionKind: kind,
    provisionRef: kind === 'building_code' ? 'IRC R105.1' : 'Zoning Ordinance Section 4.2',
    facts: 'A garage was built without a permit.',
    inspectionDate: d('2027-02-26'),
  }
}

async function caseWithFinding(kind: Kind) {
  const caseId = await investigatingCase()
  const finding = await recordFinding(handle.db, staff, findingInput(caseId, kind), signal, NOW)
  if (!finding.ok) throw new Error(finding.error)
  return { caseId, findingId: finding.value.findingId }
}

async function insertedFinding(caseId: string, kind: Kind): Promise<string> {
  const [row] = await handle.db
    .insert(violationFindings)
    .values({ ...findingInput(caseId, kind), foundOn: d('2027-02-26'), foundBy: staff.userId })
    .returning({ id: violationFindings.id })
  return row?.id ?? ''
}

async function publishProgram(codeChoice: string | null, residents: number | null = null) {
  await saveAndPublish(handle.db, admin, 'building_program', 'default', {
    key: 'default',
    permitsEnabled: true,
    codeChoice,
    residents,
  })
}

async function setPublishedAgo(interval: string) {
  await handle.db
    .update(configVersions)
    .set({ publishedAt: sql`now() - ${interval}::interval` })
    .where(and(eq(configVersions.kind, 'building_program'), eq(configVersions.status, 'published')))
}

async function setCaseCreated(caseId: string, at: ReturnType<typeof sql>) {
  await handle.db
    .update(enforcementCases)
    .set({ createdAt: at })
    .where(eq(enforcementCases.id, caseId))
}

async function dropCodeAfter(caseId: string) {
  await publishProgram(null)
  await setPublishedAgo('1 hour')
  await setCaseCreated(caseId, sql`now() - interval '2 hours'`)
}

async function dropCodeBefore(caseId: string) {
  await publishProgram(null)
  await setPublishedAgo('1 hour')
  await setCaseCreated(caseId, sql`now()`)
}

async function draft(caseId: string, findingId: string, notice = true) {
  if (notice)
    await sendFixtureNotice(handle.db, store, staff, { caseId, findingId, sentOn: '2027-02-27' })
  return await draftOrder(
    handle.db,
    staff,
    {
      caseId,
      findingIds: [findingId],
      correctiveAction: 'Apply for a permit.',
      correctiveDeadline: d('2027-04-15'),
      ceaseImmediately: false,
    },
    signal,
    NOW,
  )
}

async function issue(orderId: string) {
  const designated = await designateEnforcementOfficer(
    handle.db,
    admin,
    {
      userId: staff.userId,
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: d('2027-01-05'),
    },
    signal,
  )
  if (!designated.ok) throw new Error(designated.error)
  return await issueOrder(
    handle.db,
    store,
    staff,
    { orderId, issuedOn: d('2027-03-02'), expectedRowVersion: 1 },
    signal,
    NOW,
  )
}

const REFUSED = { ok: false, error: 'building_code_not_enforced' }

describe('a case opened before the town dropped its code', () => {
  it('still records, drafts and issues a building code order', async () => {
    const caseId = await investigatingCase()
    await dropCodeAfter(caseId)
    const finding = await recordFinding(
      handle.db,
      staff,
      findingInput(caseId, 'building_code'),
      signal,
      NOW,
    )
    if (!finding.ok) throw new Error(finding.error)
    const drafted = await draft(caseId, finding.value.findingId)
    if (!drafted.ok) throw new Error(drafted.error)
    expect((await issue(drafted.value.orderId)).ok).toBe(true)
  })

  it('keeps an existing building code draft readable and editable', async () => {
    const { caseId, findingId } = await caseWithFinding('building_code')
    const drafted = await draft(caseId, findingId)
    if (!drafted.ok) throw new Error(drafted.error)
    await dropCodeAfter(caseId)
    const [row] = await handle.db
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, drafted.value.orderId))
    const revised = await reviseDraftOrder(
      handle.db,
      staff,
      {
        orderId: drafted.value.orderId,
        expectedRowVersion: row?.rowVersion ?? 0,
        correctiveAction: 'Apply for a permit within ten days.',
        correctiveDeadline: null,
        ceaseImmediately: false,
      },
      signal,
    )
    expect(revised.ok).toBe(true)
  })
})

describe('a case opened after the town dropped its code', () => {
  it('refuses a building code finding, and an edit that turns a finding into one', async () => {
    const { caseId, findingId } = await caseWithFinding('zoning_ordinance')
    await dropCodeBefore(caseId)
    expect(
      await recordFinding(handle.db, staff, findingInput(caseId, 'building_code'), signal, NOW),
    ).toEqual(REFUSED)
    const { caseId: _caseId, ...fields } = findingInput(caseId, 'building_code')
    expect(await editFinding(handle.db, staff, { findingId, ...fields }, signal)).toEqual(REFUSED)
  })

  it('refuses to draft a building code order', async () => {
    const caseId = await investigatingCase()
    await dropCodeBefore(caseId)
    const findingId = await insertedFinding(caseId, 'building_code')
    expect(await draft(caseId, findingId, false)).toEqual(REFUSED)
  })

  it('refuses to issue a building code order drafted while the code was enforced', async () => {
    const { caseId, findingId } = await caseWithFinding('building_code')
    const drafted = await draft(caseId, findingId)
    if (!drafted.ok) throw new Error(drafted.error)
    await dropCodeBefore(caseId)
    expect(await issue(drafted.value.orderId)).toEqual(REFUSED)
  })

  it('still drafts and issues a zoning order', async () => {
    const { caseId, findingId } = await caseWithFinding('zoning_ordinance')
    await dropCodeBefore(caseId)
    const drafted = await draft(caseId, findingId)
    if (!drafted.ok) throw new Error(drafted.error)
    expect((await issue(drafted.value.orderId)).ok).toBe(true)
  })

  it('counts from the first version with no code when the town republishes without one', async () => {
    const caseId = await investigatingCase()
    await publishProgram(null)
    await setPublishedAgo('3 hours')
    await setCaseCreated(caseId, sql`now() - interval '2 hours'`)
    await publishProgram(null, 900)
    await setPublishedAgo('1 hour')
    expect(
      await recordFinding(handle.db, staff, findingInput(caseId, 'building_code'), signal, NOW),
    ).toEqual(REFUSED)
  })
})

describe('the default program', () => {
  it('records and drafts a building code order with nothing published', async () => {
    const { caseId, findingId } = await caseWithFinding('building_code')
    expect((await draft(caseId, findingId)).ok).toBe(true)
  })
})

describe('a pack with no building code order', () => {
  it('refuses a building code finding and order and leaves the kind off the section list', async () => {
    setActivePackForTest(XX_NO_BUILDING)
    const caseId = await investigatingCase()
    expect(
      await recordFinding(handle.db, staff, findingInput(caseId, 'building_code'), signal, NOW),
    ).toEqual(REFUSED)
    const findingId = await insertedFinding(caseId, 'building_code')
    expect(await draft(caseId, findingId, false)).toEqual(REFUSED)
    const view = await loadSectionListView(handle.db, admin, signal)
    expect(view?.kinds).not.toContain('building_code')
  })
})
