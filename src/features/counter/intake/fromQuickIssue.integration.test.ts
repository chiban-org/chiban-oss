import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { acceptWithoutDocument } from '@/features/applications/documentItems'
import { transitionApplication } from '@/features/applications/transition'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import {
  blockedOnFilingDocuments,
  takeQuickIssueForReview,
} from '@/features/counter/intake/fromQuickIssue'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { type QuickIssueInput, quickIssue } from '@/features/counter/quickIssue'
import { feeBalance } from '@/features/ledger/feeBalance'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.short_term_rental'] })
})
afterEach(async () => {
  await handle.drop()
})

const RENTAL: QuickIssueInput = {
  parcelId: '',
  applicationTypeKey: 'STR',
  values: {
    description: 'Lakeside cottage rented by the week',
    bedrooms: 3,
    emergency_contact: 'Robin Vale, 603-555-0100',
    septic_system: true,
  },
  contractor: { name: 'Jordan Ames', email: 'jordan.ames@alderpond.example' },
  payerName: 'Jordan Ames',
  payment: { method: 'cash', tenderedCents: 10000 },
}

async function payAll(applicationId: string): Promise<void> {
  const balance = await feeBalance(handle.db, applicationId, signal)
  const paid = await recordCounterPayment(
    handle.db,
    world.staff,
    {
      method: 'cash',
      amountCents: balance.dueCents,
      payerName: 'Jordan Ames',
      allocations: balance.lines
        .filter((l) => l.dueCents > 0)
        .map((l) => ({
          targetKind: 'fee_assessment_line' as const,
          applicationId,
          feeAssessmentId: l.feeAssessmentId,
          stage: l.stage,
          feeCode: l.feeCode,
          amountCents: l.dueCents,
        })),
    },
    signal,
    NOW,
  )
  expect(paid.ok).toBe(true)
}

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select({ state: applications.state, rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

describe('a direct-issue rental whose septic approval is a filing item', () => {
  it('is refused at quick issue, taken for review with its answers, and issued once accepted', async () => {
    const input = { ...RENTAL, parcelId: world.parcelId }
    const refused = await quickIssue(handle.db, world.staff, input, signal, { now: NOW })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(blockedOnFilingDocuments(refused.error)).toBe(true)

    const taken = await takeQuickIssueForReview(handle.db, world.staff, input, signal)
    if (!taken.ok) throw new Error(`take failed: ${JSON.stringify(taken.error)}`)
    const { applicationId } = taken.value
    const accepted = await acceptWithoutDocument(
      handle.db,
      world.staff,
      { applicationId, itemKey: 'rental_septic_approval', reason: 'Approval CA-2019-118 on file.' },
      signal,
    )
    expect(accepted.ok).toBe(true)
    const submitted = await submitCounterIntake(
      handle.db,
      world.staff,
      { applicationId, signedOnPaper: true, now: NOW },
      signal,
    )
    expect(submitted).toEqual({ ok: true, value: { state: 'submitted' } })
    await payAll(applicationId)
    const before = await stateOf(applicationId)
    const issued = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.staff,
        { applicationId, to: 'issued', expectedRowVersion: before?.rowVersion ?? 0 },
        signal,
        NOW,
      ),
    )
    expect(issued.ok).toBe(true)
    expect((await stateOf(applicationId))?.state).toBe('issued')
  })

  it('still issues in one step when the rental is on town sewer', async () => {
    const input = {
      ...RENTAL,
      parcelId: world.parcelId,
      values: { ...RENTAL.values, septic_system: false },
    }
    const issued = await quickIssue(handle.db, world.staff, input, signal, { now: NOW })
    expect(issued.ok && issued.value.state).toBe('issued')
  })
})
