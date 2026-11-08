import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, enforcementCases, enforcementOrders, violationFindings } from '@/db/schema'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import {
  editFinding,
  markFindingCorrected,
  withdrawFinding,
} from '@/features/enforcement/findingChanges'
import { recordFinding } from '@/features/enforcement/findings'
import { sendViolationNotice } from '@/features/enforcement/notices'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  issuedOrder,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'
import { downloadObject } from '@/test/objectBytes'
import { makeTestStore } from '@/test/objectStore'
import { pdfText } from '@/test/pdfText'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function caseWithFindings(refs: string[]) {
  const opened = await openCase(handle.db, world.staff, { locationText: '9 Loon Way' }, signal)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    world.staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  const findingIds: string[] = []
  for (const provisionRef of refs) {
    const made = await recordFinding(
      handle.db,
      world.staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef,
        facts: 'Seen from the road.',
        inspectionDate: '2027-02-20',
      },
      signal,
      FIXTURE_NOW,
    )
    if (!made.ok) throw new Error(made.error)
    findingIds.push(made.value.findingId)
  }
  return { caseId, findingIds }
}

async function draftFor(caseId: string, findingIds: string[]) {
  const drafted = await draftOrder(
    handle.db,
    world.staff,
    {
      caseId,
      findingIds,
      correctiveAction: 'Remove the shed.',
      correctiveDeadline: '2027-05-01',
      ceaseImmediately: false,
    },
    signal,
    FIXTURE_NOW,
  )
  if (!drafted.ok) throw new Error(JSON.stringify(drafted.error))
  return drafted.value.orderId
}

async function designate() {
  await designateEnforcementOfficer(
    handle.db,
    world.admin,
    {
      userId: world.staff.userId,
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    },
    signal,
  )
}

async function orderStatus(orderId: string) {
  const [row] = await handle.db
    .select({ status: enforcementOrders.status })
    .from(enforcementOrders)
    .where(eq(enforcementOrders.id, orderId))
  return row?.status
}

describe('issuing a draft whose findings changed', () => {
  it('is refused and names the withdrawn finding', async () => {
    const { caseId, findingIds } = await caseWithFindings(['Section 4.2', 'Section 6.1'])
    const orderId = await draftFor(caseId, findingIds)
    await designate()
    await withdrawFinding(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', reason: 'Wrong lot.' },
      signal,
    )
    const issued = await issueOrder(
      handle.db,
      store,
      world.staff,
      { orderId, issuedOn: '2027-02-26', expectedRowVersion: 1 },
      signal,
      FIXTURE_NOW,
    )
    expect(issued).toEqual({ ok: false, error: { findingsNotOpen: ['Section 4.2'] } })
    expect(await orderStatus(orderId)).toBe('draft')
  })

  it('discards a draft whose findings were all withdrawn and returns the case to investigation', async () => {
    const { caseId, findingIds } = await caseWithFindings(['Section 4.2'])
    const orderId = await draftFor(caseId, findingIds)
    const withdrawn = await withdrawFinding(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', reason: 'Wrong lot.' },
      signal,
    )
    expect(withdrawn).toEqual({ ok: true, value: { caseStatus: 'investigating' } })
    expect(await orderStatus(orderId)).toBe('withdrawn')
    const audits = await handle.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, orderId),
          eq(auditLog.action, 'enforcement.order_draft_discarded'),
        ),
      )
    expect(audits).toHaveLength(1)
  })
})

describe('automatic compliance', () => {
  it('leaves an order alone when a judgment commits while the finding is being corrected', async () => {
    const issued = await issuedOrder(handle.db, store, world)
    await handle.db
      .update(enforcementCases)
      .set({ status: 'in_court' })
      .where(eq(enforcementCases.id, issued.caseId))
    const court = await holdOpen(handle.db, async (tx) => {
      await tx.execute(
        sql`select id from enforcement_orders where id = ${issued.orderId} for update`,
      )
      await tx
        .update(enforcementOrders)
        .set({ status: 'judgment', rowVersion: 3 })
        .where(eq(enforcementOrders.id, issued.orderId))
    })
    const correcting = markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: issued.findingId, correctedOn: '2027-03-01', note: '' },
      signal,
    )
    expect(await blockedOrSettled(handle.db, correcting)).toBe('blocked')
    await court.commit()
    expect((await correcting).ok).toBe(true)
    expect(await orderStatus(issued.orderId)).toBe('judgment')
  })

  it('leaves an order alone once town counsel won a judgment on the case', async () => {
    const issued = await issuedOrder(handle.db, store, world)
    const referred = await referToCounsel(
      handle.db,
      store,
      world.staff,
      {
        caseId: issued.caseId,
        counselName: 'Attorney Rivera',
        purpose: 'motion_to_enforce',
        referredOn: '2027-02-27',
      },
      signal,
      FIXTURE_NOW,
    )
    if (!referred.ok) throw new Error(referred.error)
    const outcome = await recordCounselOutcome(
      handle.db,
      world.staff,
      {
        referralId: referred.value.referralId,
        kind: 'judgment_for_town',
        occurredOn: '2027-02-28',
      },
      signal,
    )
    expect(outcome.ok).toBe(true)
    await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: issued.findingId, correctedOn: '2027-03-01', note: '' },
      signal,
    )
    expect(await orderStatus(issued.orderId)).toBe('issued')
  })
})

describe('notices and drafts wait for a finding edit in progress', () => {
  async function editInProgress(caseId: string, findingId: string) {
    return await holdOpen(handle.db, async (tx) => {
      await tx.execute(sql`select id from enforcement_cases where id = ${caseId} for update`)
      await tx
        .update(violationFindings)
        .set({ provisionKind: 'building_code', provisionRef: 'IRC 2021 Section R105.1' })
        .where(eq(violationFindings.id, findingId))
    })
  }

  it('a notice renders the finding as the edit left it', async () => {
    const { caseId, findingIds } = await caseWithFindings(['Section 4.2'])
    const held = await editInProgress(caseId, findingIds[0] ?? '')
    const sending = sendViolationNotice(
      handle.db,
      store,
      world.staff,
      { caseId, findingIds, sentOn: '2027-02-22', method: 'first_class_mail' },
      signal,
    )
    expect(await blockedOrSettled(handle.db, sending)).toBe('blocked')
    await held.commit()
    const sent = await sending
    if (!sent.ok) throw new Error(JSON.stringify(sent.error))
    const text = await pdfText(await downloadObject(handle.db, store, sent.value.documentId))
    expect(text.replace(/\s+/g, ' ')).toContain('IRC 2021 Section R105.1')
  })

  it('a draft order picks its rule from the finding as the edit left it', async () => {
    const { caseId, findingIds } = await caseWithFindings(['Section 4.2'])
    const held = await editInProgress(caseId, findingIds[0] ?? '')
    const drafting = draftFor(caseId, findingIds)
    expect(await blockedOrSettled(handle.db, drafting)).toBe('blocked')
    await held.commit()
    const orderId = await drafting
    const [row] = await handle.db
      .select({ ruleKey: enforcementOrders.ruleKey })
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, orderId))
    expect(row?.ruleKey).toBe('nh.enf.cd_building')
  })

  it('an edit after the notice committed is refused', async () => {
    const { caseId, findingIds } = await caseWithFindings(['Section 4.2'])
    await sendViolationNotice(
      handle.db,
      store,
      world.staff,
      { caseId, findingIds, sentOn: '2027-02-22', method: 'first_class_mail' },
      signal,
    )
    const edited = await editFinding(
      handle.db,
      world.staff,
      {
        findingId: findingIds[0] ?? '',
        provisionKind: 'building_code',
        provisionRef: 'IRC 2021 Section R105.1',
        facts: 'x',
        inspectionDate: '2027-02-20',
      },
      signal,
    )
    expect(edited).toEqual({ ok: false, error: 'finding_in_use' })
  })
})
