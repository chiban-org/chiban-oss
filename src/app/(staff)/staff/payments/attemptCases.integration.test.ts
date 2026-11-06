import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { paymentAttempts } from '@/db/schema'
import { MANUAL_OUTCOME_AFTER_MS } from '@/features/payments/manualOutcomeCheck'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { idMessage, textMessage } from '@/test/boardCases'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { makeCardAttempt, setupPayments } from '@/test/paymentFixtures'
import { refusalBy } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin)
})

const finance = () => h.actorFor('finance')
const SHORT_COPY = (noun: string) => `Enter ${noun} of at least 10 characters.`

async function freshAttempt(): Promise<string> {
  return (await makeCardAttempt(h.db, await submittedTrade(h.db, world))).attemptId
}

async function stuckAttempt(): Promise<string> {
  const attemptId = await freshAttempt()
  await h.db
    .update(paymentAttempts)
    .set({
      processorObjectId: `pi_${attemptId.slice(0, 8)}`,
      outcomeUnknown: true,
      updatedAt: new Date(Date.now() - MANUAL_OUTCOME_AFTER_MS - 60_000),
    })
    .where(eq(paymentAttempts.id, attemptId))
  return attemptId
}

async function attemptState(attemptId: string) {
  const [row] = await h.db
    .select({ state: paymentAttempts.state, manualOutcome: paymentAttempts.manualOutcome })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  return row
}

function checkOnly(fields: Record<string, string>): FormData {
  const form = h.form(fields)
  form.set(CHECK_ONLY_FIELD, '1')
  return form
}

describeActionCases(h, 'checkWithProcessorAction', {
  invoke: actions.checkWithProcessorAction,
  actor: finance,
  input: async () => ({ attemptId: await freshAttempt() }),
  fields: { attemptId: uuid({ required: true }) },
  refusedRoles: ['reviewer', 'inspector'],
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ attemptId: () => idMessage('an attempt') }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input }) => {
    expect(result).toEqual({ ok: true, message: 'The processor reports this attempt as pending.' })
    expect((await attemptState(String(input.attemptId)))?.state).toBe('pending')
  },
})

describeActionCases(h, 'voidAttemptAction', {
  invoke: actions.voidAttemptAction,
  actor: finance,
  input: async () => ({ attemptId: await freshAttempt(), reason: 'Customer walked away' }),
  fields: { attemptId: uuid({ required: true }), reason: text({ required: true, max: 2000 }) },
  capability: 'payment.refund_void_correct',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      attemptId: () => idMessage('an attempt'),
      reason: (v) => textMessage('a reason', 2000, v),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Attempt voided.' })
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'payment_attempts']))
    expect((await attemptState(String(input.attemptId)))?.state).toBe('voided')
  },
})

describeActionCases(h, 'recordOutcomeByHandAction', {
  invoke: actions.recordOutcomeByHandAction,
  actor: finance,
  input: async () => ({
    attemptId: await stuckAttempt(),
    outcome: 'declined',
    note: 'Clover support line, agent Sam, ref CLV-77',
  }),
  fields: {
    attemptId: uuid({ required: true }),
    outcome: choice({ required: true }),
    processorRef: text({ max: 200 }),
    note: text({ required: true, max: 2000 }),
  },
  capability: 'payment.refund_void_correct',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      attemptId: () => idMessage('an attempt'),
      outcome: () => 'Choose what the processor confirmed.',
      processorRef: (v) => textMessage('the processor reference', 200, v),
      note: (v) => textMessage('a note', 2000, v),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Recorded as declined. The attempt is closed.',
    })
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'payment_attempts']))
    expect(await attemptState(String(input.attemptId))).toEqual({
      state: 'declined',
      manualOutcome: 'declined',
    })
  },
})

describe('the sweep findings on attempts', () => {
  it('checks a void reason of 5 characters before the confirm opens', async () => {
    h.signIn(await finance())
    const attemptId = await freshAttempt()
    const outcome = await h.recordWrites(() =>
      actions.voidAttemptAction(checkOnly({ attemptId, reason: 'short' })),
    )
    expect(outcome).toEqual({
      value: refuseField('reason', SHORT_COPY('a reason')),
      written: [],
    })
  })

  it('checks a by-hand note of 5 characters before the confirm opens', async () => {
    h.signIn(await finance())
    const attemptId = await stuckAttempt()
    const outcome = await h.recordWrites(() =>
      actions.recordOutcomeByHandAction(
        checkOnly({ attemptId, outcome: 'declined', note: 'short' }),
      ),
    )
    expect(outcome).toEqual({
      value: refuseField('note', SHORT_COPY('a note')),
      written: [],
    })
  })

  it('names the processor reference when approving without one', async () => {
    h.signIn(await finance())
    const attemptId = await stuckAttempt()
    await h.db
      .update(paymentAttempts)
      .set({ processorObjectId: null })
      .where(eq(paymentAttempts.id, attemptId))
    const result = await actions.recordOutcomeByHandAction(
      h.form({ attemptId, outcome: 'approved', note: 'Clover support line, agent Sam' }),
    )
    expect(result).toEqual(
      refuseField('processorRef', "Enter the processor's reference for this payment."),
    )
  })
})
