import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { recordAppeal } from '@/features/appeals/appeals'
import { startClocksFor } from '@/features/clocks/startClocks'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { recordAppealAction, resolveAppealAction, renewAction } = await import('./buildingActions')

const h = actionHarness()
let world: PermitWorld
const signal = new AbortController().signal
const ISSUED = { issuedOn: '2026-03-15' }
const RENEW_NOW = new Date('2028-06-01T16:00:00Z')
const RENEW_TODAY = '2028-06-01'
const RENEW_TODAY_COPY = 'June 1, 2028'
const RANGE = 'between January 1, 1900 and December 31, 2099.'

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const issued = async () => (await applicationIn(h.db, world, 'issued', ISSUED)).applicationId

function dateCopy(noun: string) {
  return {
    missing: `Enter ${noun}.`,
    impossible_date: `Enter ${noun} as a date.`,
    words: `Enter ${noun} as a date.`,
    otherwise: `Enter ${noun} ${RANGE}`,
  }
}

describeActionCases(h, 'recordAppealAction', {
  invoke: recordAppealAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await issued(),
    filedOn: '2026-05-01',
    appellantName: 'Abutter Smith',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    filedOn: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    appellantName: text({ required: true, max: 200 }),
  },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      filedOn: dateCopy('the filing date'),
      appellantName: {
        missing: 'Enter the appellant name.',
        whitespace: 'Enter the appellant name.',
        otherwise: 'Enter the appellant name of 200 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Appeal recorded. The permit is suspended.' })
    expect(written).toEqual(['appeals', 'applications', 'audit_log'])
  },
})

async function appealed(): Promise<string> {
  const applicationId = await issued()
  await recordAppeal(
    h.db,
    await h.actorFor('staff'),
    { applicationId, filedOn: '2026-05-01' as CivilDate, appellantName: 'Abutter Smith' },
    signal,
  )
  return applicationId
}

describeActionCases(h, 'resolveAppealAction', {
  invoke: resolveAppealAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await appealed(),
    resolvedOn: '2026-06-10',
    outcome: 'permit_upheld',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    resolvedOn: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    outcome: choice({ required: true }),
  },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      resolvedOn: dateCopy('the resolution date'),
      outcome: 'Choose an outcome.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Appeal resolved.' })
    expect(written).toEqual(['appeals', 'applications', 'audit_log'])
  },
})

async function renewable(): Promise<string> {
  const applicationId = (await applicationIn(h.db, world, 'issued', { issuedOn: '2027-03-15' }))
    .applicationId
  await h.db.transaction((tx) =>
    startClocksFor(tx, applicationId, 'permit_issued', '2027-03-15' as CivilDate, signal),
  )
  return applicationId
}

describe('renewAction', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: RENEW_NOW })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  describeActionCases(h, 'renewAction', {
    invoke: renewAction,
    actor: () => h.actorFor('staff'),
    input: async () => ({ applicationId: await renewable(), renewedOn: '2028-03-01' }),
    fields: {
      applicationId: uuid({ required: true }),
      renewedOn: date({ required: true, earliest: '1900-01-01', latest: RENEW_TODAY }),
    },
    capability: 'permit.issue',
    refusals: {
      ...STAFF_REFUSALS,
      invalid: refusalFor({
        applicationId: 'Choose an application.',
        renewedOn: {
          ...dateCopy('the renewal date'),
          otherwise: `Enter the renewal date between January 1, 1900 and ${RENEW_TODAY_COPY}.`,
        },
      }),
      checkOnly: CHECK_PASSED,
    },
    accepted: (result, { written }) => {
      expect(result).toEqual({
        ok: true,
        message: 'Renewed. The permit now runs to March 1, 2029.',
      })
      expect(written).toEqual(['audit_log', 'clock_adjustments', 'clocks', 'fee_assessments'])
    },
  })
})

describe('appeal dates after today', () => {
  it('names the filing date for a filing dated 2098 and files nothing', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await issued()
    const outcome = await h.recordWrites(() =>
      recordAppealAction(
        h.form({ applicationId, filedOn: '2098-01-01', appellantName: 'Abutter Smith' }),
      ),
    )
    expect(outcome).toEqual({
      value: refuseField('filedOn', 'The filing date cannot be in the future.'),
      written: [],
    })
  })

  it('names the resolution date when it is before the filing', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await appealed()
    const result = await resolveAppealAction(
      h.form({ applicationId, resolvedOn: '2026-04-01', outcome: 'permit_upheld' }),
    )
    expect(result).toEqual(
      refuseField('resolvedOn', 'The resolution date cannot be before the appeal was filed.'),
    )
  })
})
