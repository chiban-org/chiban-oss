import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applyCondition } from '@/features/conditions/applicationConditions'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  describeActionCases,
  money,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { feeOverrideAction } = await import('./clockFeeActions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const underReview = async () => (await applicationIn(h.db, world, 'under_review')).applicationId
const AMOUNT_COPY = {
  below_min: 'Enter the amount from $0.01 to $10,000,000.00.',
  otherwise: 'Enter the amount in dollars and cents, like 25.00.',
}
const REASON_COPY = {
  missing: 'Enter a reason.',
  whitespace: 'Enter a reason.',
  otherwise: 'Enter a reason of 2000 characters or fewer.',
}

describeActionCases(h, 'feeOverrideAction', {
  invoke: feeOverrideAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await underReview(),
    feeCode: 'el',
    kind: 'set_amount',
    amount: '30.00',
    reason: 'Hardship',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    feeCode: text({ required: true, max: 100 }),
    kind: choice({ required: true }),
    amount: money(),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'fee.override',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      feeCode: {
        missing: 'Enter a fee.',
        whitespace: 'Enter a fee.',
        otherwise: 'Enter a fee of 100 characters or fewer.',
      },
      kind: 'Choose an override.',
      amount: AMOUNT_COPY,
      reason: REASON_COPY,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Fee override saved. It applies at the next assessment.',
    })
    expect(written).toEqual(['audit_log', 'fee_overrides'])
  },
})

describe('the sweep findings on fee overrides', () => {
  it.each([
    '0',
    '-5',
    '1.005',
    'abc',
    '   ',
  ])('names the Amount field for a set amount of "%s"', async (amount) => {
    h.signIn(await h.actorFor('staff'))
    const result = await feeOverrideAction(
      h.form({
        applicationId: await underReview(),
        feeCode: 'el',
        kind: 'set_amount',
        amount,
        reason: 'Hardship',
      }),
    )
    const copy =
      amount === '0'
        ? 'Enter the amount from $0.01 to $10,000,000.00.'
        : amount.trim() === ''
          ? 'Enter the amount.'
          : 'Enter the amount in dollars and cents, like 25.00.'
    expect(result).toEqual(refuseField('amount', copy))
  })

  it('lets a waiver go through without an amount', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await feeOverrideAction(
      h.form({
        applicationId: await underReview(),
        feeCode: 'el',
        kind: 'waive',
        reason: 'Town-owned',
      }),
    )
    expect(result.ok).toBe(true)
  })
})
