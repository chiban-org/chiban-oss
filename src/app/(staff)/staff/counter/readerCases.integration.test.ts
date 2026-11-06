import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  CounterClaimResult,
  CounterOutcome,
  ReaderStatus,
} from '@/components/counter/counterTypes'
import { paymentAttempts } from '@/db/schema'
import { quickIssue } from '@/features/counter/quickIssue'
import { resolveSimulatedReader } from '@/features/payments/startPayment'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { plainRefusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  rolesLacking,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'
import type { Refusals } from '@/test/testHarness/actions/cases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { completeAction, sendClaimAction } = await import('./actions')
const { readerAction, checkAction, reconnectAction } = await import('./readerActions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin, 'simulated', 'sim_town')
})

const READER_REFUSALS = STAFF_REFUSALS as unknown as Refusals<ReaderStatus>
const OUTCOME_REFUSALS = STAFF_REFUSALS as unknown as Refusals<CounterOutcome>
const ATTEMPT = 'Choose a card payment.'

async function started(): Promise<{ attemptId: string; applicationId: string }> {
  const staff = await h.actorFor('staff')
  const issued = await quickIssue(
    h.db,
    staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: 'EL',
      values: { description: 'Panel upgrade' },
      contractor: { name: 'Pat Contractor', email: 'pat@contractor.example' },
      license: { number: 'EL-20418', type: 'Electrician', result: 'active' },
      payerName: 'Pat Contractor',
      payment: { method: 'card' },
    },
    new AbortController().signal,
  )
  if (!issued.ok || issued.value.attemptId === null) throw new Error('card start failed')
  return { attemptId: issued.value.attemptId, applicationId: issued.value.applicationId }
}

async function stateOf(attemptId: string) {
  const [row] = await h.db
    .select({ state: paymentAttempts.state, unknown: paymentAttempts.outcomeUnknown })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  return row
}

describeActionCases(h, 'readerAction', {
  invoke: readerAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ attemptId: (await started()).attemptId, outcome: 'captured' }),
  fields: { attemptId: uuid({ required: true }), outcome: choice({ required: true }) },
  capability: 'payment.collect',
  refusals: {
    ...READER_REFUSALS,
    invalid: plainRefusalFor({ attemptId: ATTEMPT, outcome: 'Choose an outcome.' }),
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, state: 'captured', outcomeUnknown: false })
    const [row] = await db
      .select({ state: paymentAttempts.state })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, input.attemptId))
    expect(row?.state).toBe('captured')
  },
})

describeActionCases(h, 'checkAction', {
  invoke: checkAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ attemptId: (await started()).attemptId }),
  fields: { attemptId: uuid({ required: true }) },
  capability: ['payment.collect', 'payment.refund_void_correct'],
  refusals: { ...READER_REFUSALS, invalid: plainRefusalFor({ attemptId: ATTEMPT }) },
  accepted: (result) => {
    expect(result).toMatchObject({ ok: true, state: 'pending' })
  },
})

describeActionCases(h, 'reconnectAction', {
  invoke: reconnectAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ attemptId: (await started()).attemptId, outcome: 'captured' }),
  fields: { attemptId: uuid({ required: true }), outcome: choice({ required: true }) },
  capability: 'payment.collect',
  refusals: {
    ...READER_REFUSALS,
    invalid: plainRefusalFor({ attemptId: ATTEMPT, outcome: 'Choose an outcome.' }),
  },
  accepted: (result) => {
    expect(result).toEqual({ ok: true, state: 'captured', outcomeUnknown: false })
  },
})

describeActionCases(h, 'completeAction', {
  invoke: completeAction,
  actor: () => h.actorFor('staff'),
  input: async () => {
    const card = await started()
    await resolveSimulatedReader(
      h.db,
      await h.actorFor('staff'),
      { attemptId: card.attemptId, outcome: 'captured' },
      new AbortController().signal,
    )
    return { applicationId: card.applicationId }
  },
  fields: { applicationId: uuid({ required: true }) },
  refusedRoles: rolesLacking('permit.issue'),
  refusals: {
    ...OUTCOME_REFUSALS,
    invalid: plainRefusalFor({ applicationId: 'Choose an application.' }),
  },
  accepted: (result) => {
    expect(result).toMatchObject({ ok: true, state: 'issued' })
  },
})

describeActionCases(h, 'sendClaimAction', {
  invoke: sendClaimAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ applicationId: (await started()).applicationId }),
  fields: { applicationId: uuid({ required: true }) },
  capability: 'project.manage_parties',
  refusals: {
    ...(STAFF_REFUSALS as unknown as Refusals<CounterClaimResult>),
    invalid: plainRefusalFor({ applicationId: 'Choose an application.' }),
  },
  accepted: (result) => {
    expect(result).toEqual({ ok: true, message: 'Claim link sent to the contractor.' })
  },
})

describe('the card panel after the reader loses its connection', () => {
  it('stays unknown while the processor has not reported, then captures once the reader reconnects approved', async () => {
    h.signIn(await h.actorFor('staff'))
    const card = await started()
    const lost = await readerAction(h.form({ attemptId: card.attemptId, outcome: 'unknown' }))
    expect(lost).toMatchObject({ ok: true, outcomeUnknown: true })
    const checked = await checkAction(h.form({ attemptId: card.attemptId }))
    expect(checked).toMatchObject({ ok: true, state: 'pending', outcomeUnknown: true })
    const reconnected = await reconnectAction(
      h.form({ attemptId: card.attemptId, outcome: 'captured' }),
    )
    expect(reconnected).toEqual({ ok: true, state: 'captured', outcomeUnknown: false })
    expect(await stateOf(card.attemptId)).toEqual({ state: 'captured', unknown: false })
    const issued = await completeAction(h.form({ applicationId: card.applicationId }))
    expect(issued).toMatchObject({ ok: true, state: 'issued' })
  })

  it('declines the attempt when the reader reconnects declined', async () => {
    h.signIn(await h.actorFor('staff'))
    const card = await started()
    await readerAction(h.form({ attemptId: card.attemptId, outcome: 'unknown' }))
    const reconnected = await reconnectAction(
      h.form({ attemptId: card.attemptId, outcome: 'declined' }),
    )
    expect(reconnected).toEqual({ ok: true, state: 'declined', outcomeUnknown: false })
    expect(await stateOf(card.attemptId)).toEqual({ state: 'declined', unknown: false })
  })
})
