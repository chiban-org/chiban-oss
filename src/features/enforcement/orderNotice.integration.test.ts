import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { EVERY_CASE_ABILITY } from '@/features/enforcement/caseNextStep'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { recordFinding } from '@/features/enforcement/findings'
import { sendViolationNotice } from '@/features/enforcement/notices'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import { planCaseWork } from '@/features/enforcement/workPlan'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let store: ObjectStore
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  staff = await staffActor(handle.db, 'staff')
  const admin = await staffActor(handle.db, 'admin')
  const designated = await designateEnforcementOfficer(
    handle.db,
    admin,
    {
      userId: staff.userId,
      title: 'Code Enforcement Officer',
      adoptingAuthority: 'Select Board',
      adoptedOn: '2027-01-05',
    },
    signal,
  )
  if (!designated.ok) throw new Error(designated.error)
})
afterEach(async () => {
  await handle.drop()
})

async function draftedCase() {
  const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal, NOW)
  if (!opened.ok) throw new Error(opened.error)
  const { caseId } = opened.value
  await setCaseStatus(
    handle.db,
    staff,
    { caseId, to: 'investigating', expectedRowVersion: 1 },
    signal,
  )
  const finding = await recordFinding(
    handle.db,
    staff,
    {
      caseId,
      provisionKind: 'zoning_ordinance',
      provisionRef: 'Zoning Ordinance Section 4.2',
      facts: 'A garage was built without a permit.',
      inspectionDate: '2027-02-26',
    },
    signal,
    NOW,
  )
  if (!finding.ok) throw new Error(JSON.stringify(finding.error))
  const drafted = await draftOrder(
    handle.db,
    staff,
    {
      caseId,
      findingIds: [finding.value.findingId],
      correctiveAction: 'Remove the garage or apply for a permit.',
      correctiveDeadline: '2027-04-15',
      ceaseImmediately: false,
    },
    signal,
    NOW,
  )
  if (!drafted.ok) throw new Error(JSON.stringify(drafted.error))
  return { caseId, findingId: finding.value.findingId, orderId: drafted.value.orderId }
}

async function noticeRowDone(caseId: string): Promise<boolean | undefined> {
  const detail = await loadCaseDetail(handle.db, staff, caseId, TODAY, signal)
  if (!detail.ok) throw new Error(detail.error)
  const plan = planCaseWork(detail.value, { abilities: EVERY_CASE_ABILITY, responsible: null })
  return plan.groups.flatMap((g) => g.rows).find((r) => r.key === 'notice.sent')?.done
}

async function issue(orderId: string) {
  return await issueOrder(
    handle.db,
    store,
    staff,
    { orderId, issuedOn: '2027-03-02', expectedRowVersion: 1 },
    signal,
    NOW,
  )
}

describe('issuing an order needs a notice of violation', () => {
  it('refuses while the requirements list shows no notice sent', async () => {
    const { caseId, orderId } = await draftedCase()
    expect(await noticeRowDone(caseId)).toBe(false)
    expect(await issue(orderId)).toEqual({ ok: false, error: 'notice_required' })
  })

  it('issues once the notice is sent, even before its receipt is recorded', async () => {
    const { caseId, findingId, orderId } = await draftedCase()
    const sent = await sendViolationNotice(
      handle.db,
      store,
      staff,
      { caseId, findingIds: [findingId], sentOn: '2027-02-27', method: 'in_hand' },
      signal,
    )
    if (!sent.ok) throw new Error(sent.error)
    expect(await noticeRowDone(caseId)).toBe(true)
    expect((await issue(orderId)).ok).toBe(true)
  })

  it('points the next step at the notice when a draft exists but no notice was sent', async () => {
    const { caseId } = await draftedCase()
    const detail = await loadCaseDetail(handle.db, staff, caseId, TODAY, signal)
    if (!detail.ok) throw new Error(detail.error)
    const plan = planCaseWork(detail.value, { abilities: EVERY_CASE_ABILITY, responsible: null })
    expect(plan.now?.key).toBe('notice.sent')
  })
})
