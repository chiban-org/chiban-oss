import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, enforcementCases, enforcementOrders, violationFindings } from '@/db/schema'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import {
  editFinding,
  markFindingCorrected,
  withdrawFinding,
} from '@/features/enforcement/findingChanges'
import { recordFinding } from '@/features/enforcement/findings'
import { sendViolationNotice } from '@/features/enforcement/notices'
import { draftOrder } from '@/features/enforcement/orders'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  issuedOrder,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'

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

async function caseWithFindings(count = 1): Promise<{ caseId: string; findingIds: string[] }> {
  const opened = await openCase(handle.db, world.staff, { locationText: '14 Birch Lane' }, signal)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    world.staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  const findingIds: string[] = []
  for (let i = 0; i < count; i += 1) {
    const made = await recordFinding(
      handle.db,
      world.staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: `Zoning Ordinance Section 4.${String(i + 1)}`,
        facts: 'A shed sits on the lot line.',
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

async function findingRow(findingId: string) {
  const [row] = await handle.db
    .select()
    .from(violationFindings)
    .where(eq(violationFindings.id, findingId))
  return row
}

async function caseStatus(caseId: string) {
  const [row] = await handle.db
    .select({ status: enforcementCases.status })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  return row?.status
}

const EDIT = {
  provisionKind: 'building_code' as const,
  provisionRef: 'IRC 2021 Section R105.1, work without a required permit',
  facts: 'The shed is over 400 square feet and has no permit.',
  inspectionDate: '2027-02-21',
}

describe('editing a finding', () => {
  it('saves the new values and audits before and after on the case', async () => {
    const { caseId, findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const edited = await editFinding(handle.db, world.staff, { findingId, ...EDIT }, signal)
    expect(edited).toEqual({ ok: true, value: undefined })
    expect(await findingRow(findingId)).toMatchObject(EDIT)
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, caseId), eq(auditLog.action, 'enforcement.finding_edited')))
    expect(audit?.before).toMatchObject({ findingId, provisionKind: 'zoning_ordinance' })
    expect(audit?.after).toMatchObject({ findingId, ...EDIT })
  })

  it('is refused once the finding is in a notice', async () => {
    const { caseId, findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const sent = await sendViolationNotice(
      handle.db,
      store,
      world.staff,
      { caseId, findingIds: [findingId], sentOn: '2027-02-22', method: 'first_class_mail' },
      signal,
    )
    expect(sent.ok).toBe(true)
    const edited = await editFinding(handle.db, world.staff, { findingId, ...EDIT }, signal)
    expect(edited).toEqual({ ok: false, error: 'finding_in_use' })
    expect((await findingRow(findingId))?.provisionKind).toBe('zoning_ordinance')
  })

  it('is refused once the finding is in a draft order', async () => {
    const { caseId, findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const drafted = await draftOrder(
      handle.db,
      world.staff,
      {
        caseId,
        findingIds: [findingId],
        correctiveAction: 'Move the shed.',
        correctiveDeadline: '2027-05-01',
        ceaseImmediately: false,
      },
      signal,
      FIXTURE_NOW,
    )
    expect(drafted.ok).toBe(true)
    const edited = await editFinding(handle.db, world.staff, { findingId, ...EDIT }, signal)
    expect(edited).toEqual({ ok: false, error: 'finding_in_use' })
  })

  it('is refused for a withdrawn finding', async () => {
    const { findingIds } = await caseWithFindings(2)
    const findingId = findingIds[0] ?? ''
    await withdrawFinding(handle.db, world.staff, { findingId, reason: 'Wrong lot.' }, signal)
    const edited = await editFinding(handle.db, world.staff, { findingId, ...EDIT }, signal)
    expect(edited).toEqual({ ok: false, error: 'finding_not_open' })
  })

  it('is refused to a user who cannot manage enforcement', async () => {
    const { findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const edited = await editFinding(handle.db, world.finance, { findingId, ...EDIT }, signal)
    expect(edited).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('withdrawing a finding', () => {
  it('records who, when and why and keeps the case status while another finding is open', async () => {
    const { caseId, findingIds } = await caseWithFindings(2)
    const findingId = findingIds[0] ?? ''
    const withdrawn = await withdrawFinding(
      handle.db,
      world.staff,
      { findingId, reason: 'Recorded on the wrong lot.' },
      signal,
    )
    expect(withdrawn).toEqual({ ok: true, value: { caseStatus: 'violation_found' } })
    expect(await findingRow(findingId)).toMatchObject({
      status: 'withdrawn',
      withdrawnReason: 'Recorded on the wrong lot.',
      withdrawnBy: world.staff.userId,
    })
    expect((await findingRow(findingId))?.withdrawnAt).toBeInstanceOf(Date)
    expect(await caseStatus(caseId)).toBe('violation_found')
  })

  it('returns the case to investigating when every finding is withdrawn and nothing went out', async () => {
    const { caseId, findingIds } = await caseWithFindings(2)
    for (const findingId of findingIds) {
      await withdrawFinding(handle.db, world.staff, { findingId, reason: 'Mistake.' }, signal)
    }
    expect(await caseStatus(caseId)).toBe('investigating')
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, caseId), eq(auditLog.action, 'enforcement.case_status')))
    expect(audits.at(-1)?.after).toMatchObject({ status: 'investigating' })
  })

  it('keeps violation found when every finding is withdrawn after a notice went out', async () => {
    const { caseId, findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    await sendViolationNotice(
      handle.db,
      store,
      world.staff,
      { caseId, findingIds: [findingId], sentOn: '2027-02-22', method: 'first_class_mail' },
      signal,
    )
    const withdrawn = await withdrawFinding(
      handle.db,
      world.staff,
      { findingId, reason: 'Mistake.' },
      signal,
    )
    expect(withdrawn).toEqual({ ok: true, value: { caseStatus: 'violation_found' } })
    expect(await caseStatus(caseId)).toBe('violation_found')
  })

  it('needs a reason', async () => {
    const { findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const withdrawn = await withdrawFinding(
      handle.db,
      world.staff,
      { findingId, reason: ' ' },
      signal,
    )
    expect(withdrawn).toEqual({ ok: false, error: 'invalid' })
  })

  it('is refused to a user who cannot manage enforcement', async () => {
    const { findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const withdrawn = await withdrawFinding(
      handle.db,
      world.finance,
      { findingId, reason: 'Mistake.' },
      signal,
    )
    expect(withdrawn).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('marking a finding corrected', () => {
  it('stores the date and note and refuses a second change', async () => {
    const { findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    const input = { findingId, correctedOn: '2027-02-25', note: 'Shed moved back 10 feet.' }
    const marked = await markFindingCorrected(handle.db, world.staff, input, signal)
    expect(marked.ok).toBe(true)
    expect(await findingRow(findingId)).toMatchObject({
      status: 'corrected',
      correctedOn: '2027-02-25',
      correctedNote: 'Shed moved back 10 feet.',
      correctedBy: world.staff.userId,
    })
    const again = await markFindingCorrected(handle.db, world.staff, input, signal)
    expect(again).toEqual({ ok: false, error: 'finding_not_open' })
  })

  it('marks an issued order complied once every finding on it is corrected', async () => {
    const issued = await issuedOrder(handle.db, store, world)
    const marked = await markFindingCorrected(
      handle.db,
      world.staff,
      { findingId: issued.findingId, correctedOn: '2027-03-01', note: '' },
      signal,
    )
    expect(marked.ok).toBe(true)
    const [order] = await handle.db
      .select({ status: enforcementOrders.status })
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, issued.orderId))
    expect(order?.status).toBe('complied')
  })

  it('is refused to a user who cannot manage enforcement', async () => {
    const { findingIds } = await caseWithFindings()
    const marked = await markFindingCorrected(
      handle.db,
      world.finance,
      { findingId: findingIds[0] ?? '', correctedOn: '2027-02-25', note: '' },
      signal,
    )
    expect(marked).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('recording no violation after findings were withdrawn', () => {
  async function noticedCase() {
    const { caseId, findingIds } = await caseWithFindings()
    const findingId = findingIds[0] ?? ''
    await sendViolationNotice(
      handle.db,
      store,
      world.staff,
      { caseId, findingIds: [findingId], sentOn: '2027-02-22', method: 'first_class_mail' },
      signal,
    )
    return { caseId, findingId }
  }

  async function rowVersion(caseId: string) {
    const [row] = await handle.db
      .select({ v: enforcementCases.rowVersion })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    return row?.v ?? 0
  }

  it('is refused while a finding stands', async () => {
    const { caseId } = await noticedCase()
    const moved = await setCaseStatus(
      handle.db,
      world.staff,
      { caseId, to: 'no_violation', expectedRowVersion: await rowVersion(caseId) },
      signal,
    )
    expect(moved).toEqual({ ok: false, error: 'invalid_transition' })
  })

  it('is allowed once every finding is withdrawn', async () => {
    const { caseId, findingId } = await noticedCase()
    await withdrawFinding(handle.db, world.staff, { findingId, reason: 'Mistake.' }, signal)
    const moved = await setCaseStatus(
      handle.db,
      world.staff,
      { caseId, to: 'no_violation', expectedRowVersion: await rowVersion(caseId) },
      signal,
    )
    expect(moved.ok).toBe(true)
    expect(await caseStatus(caseId)).toBe('no_violation')
  })
})
