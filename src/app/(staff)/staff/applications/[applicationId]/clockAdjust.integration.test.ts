import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { clocks } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import {
  actionHarness,
  choice,
  describeActionCases,
  type InvalidVariant,
  int,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { adjustClockAction } = await import('./clockFeeActions')

const h = actionHarness()
let world: BoardWorld
beforeAll(async () => {
  world = await setupBoardWorld(h.db)
})

async function zbaDecisionClock(): Promise<string> {
  const applicationId = await submitBoardApplication(h.db, world, world.zbaTypeKey, '2027-03-02')
  const [clock] = await h.db
    .select({ id: clocks.id })
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, 'nh.zba.decision')))
  return clock?.id ?? ''
}

async function dueOf(clockId: string): Promise<string | undefined> {
  const [clock] = await h.db
    .select({ due: clocks.currentDue })
    .from(clocks)
    .where(eq(clocks.id, clockId))
  return clock?.due
}

const DAYS_MESSAGE = 'Enter the number of days as a whole number from 1 to 365.'

function refusalFor(variant: InvalidVariant) {
  if (variant.field === 'clockId') return refuseField('clockId', 'Choose a clock.')
  if (variant.field === 'kind') return refuseField('kind', 'Choose a kind of adjustment.')
  if (variant.field === 'days') return refuseField('days', DAYS_MESSAGE)
  return refuseField(
    'reason',
    variant.kind === 'too_long' ? 'Enter a reason of 2000 characters or fewer.' : 'Enter a reason.',
  )
}

describeActionCases(h, 'adjustClockAction', {
  invoke: adjustClockAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    clockId: await zbaDecisionClock(),
    kind: 'extension',
    days: '30',
    reason: 'Applicant asked for time to revise plans',
    applicantConsent: 'on',
  }),
  fields: {
    clockId: uuid({ required: true }),
    kind: choice({ required: true }),
    days: int({ min: 1, max: 365 }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'clock.adjust',
  refusals: { ...STAFF_REFUSALS, invalid: refusalFor, checkOnly: CHECK_PASSED },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Clock adjusted. It is now due June 30, 2027.' })
    expect(written).toEqual(['audit_log', 'clock_adjustments', 'clocks'])
    expect(await dueOf(input.clockId)).toBe('2027-06-30')
  },
})

describe('adjustClockAction with the day counts from the forms sweep', () => {
  it('refuses -5, 0 and 999999 days beside the Days field and leaves the clock where it was', async () => {
    h.signIn(await h.actorFor('staff'))
    const clockId = await zbaDecisionClock()
    for (const days of ['-5', '0', '999999']) {
      const result = await adjustClockAction(
        h.form({ clockId, kind: 'extension', days, reason: 'Sweep check', applicantConsent: 'on' }),
      )
      expect([days, result]).toEqual([days, refuseField('days', DAYS_MESSAGE)])
    }
    expect(await dueOf(clockId)).toBe('2027-05-31')
  })

  it('names the Days field when an extension has no day count', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await adjustClockAction(
      h.form({
        clockId: await zbaDecisionClock(),
        kind: 'extension',
        reason: 'Applicant asked',
        applicantConsent: 'on',
      }),
    )
    expect(result).toEqual(refuseField('days', 'Enter the number of days or a new due date.'))
  })

  it('names the consent box when the applicant has not consented', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await adjustClockAction(
      h.form({ clockId: await zbaDecisionClock(), kind: 'extension', days: '30', reason: 'Asked' }),
    )
    expect(result).toEqual(
      refuseField('applicantConsent', "This extension needs the applicant's consent."),
    )
  })
})
