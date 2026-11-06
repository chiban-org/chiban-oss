import { beforeAll, describe, expect, it, vi } from 'vitest'
import { recordRegionalImpactDetermination } from '@/features/building/regionalImpact'
import { formatCivilDate } from '@/lib/formatDate'
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
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { regionalImpactAction, regionalNoticeAction } = await import('./buildingActions')

const h = actionHarness()
let world: PermitWorld
const signal = new AbortController().signal
const today = todayInTimeZone('America/New_York', new Date())
const BUILDING = {
  receivedDate: '2026-06-01',
  facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
}

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const underReview = async () =>
  (await applicationIn(h.db, world, 'under_review', BUILDING)).applicationId

const between = (noun: string) =>
  `Enter ${noun} between January 1, 1900 and ${formatCivilDate(today)}.`
const NAME_COPY = (noun: string) => ({
  missing: `Enter ${noun}.`,
  whitespace: `Enter ${noun}.`,
  otherwise: `Enter ${noun} of 200 characters or fewer.`,
})

describeActionCases(h, 'regionalImpactAction', {
  invoke: regionalImpactAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await underReview(),
    determination: 'yes',
    determinedOn: '2026-06-10',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    determination: choice({ required: true }),
    determinedOn: date({ required: true, earliest: '1900-01-01', latest: today }),
    previousBoardRef: text({ max: 200 }),
  },
  capability: 'regional_impact.determine',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      determination: 'Choose a determination.',
      determinedOn: {
        missing: 'Enter the determination date.',
        impossible_date: 'Enter the determination date as a date.',
        words: 'Enter the determination date as a date.',
        otherwise: between('the determination date'),
      },
      previousBoardRef: 'Enter the board reference of 200 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Determination recorded.' })
    expect(written).toEqual(['audit_log', 'regional_impact_determinations'])
  },
})

describeActionCases(h, 'regionalNoticeAction', {
  invoke: regionalNoticeAction,
  actor: () => h.actorFor('staff'),
  input: async () => {
    const applicationId = await underReview()
    await recordRegionalImpactDetermination(
      h.db,
      await h.actorFor('staff'),
      { applicationId, determination: 'yes', determinedOn: '2026-06-10' as CivilDate },
      signal,
    )
    return {
      applicationId,
      recipientKind: 'regional_planning_commission',
      recipientName: 'Alder Pond RPC',
      method: 'certified_mail',
      mailedOn: '2026-06-12',
    }
  },
  fields: {
    applicationId: uuid({ required: true }),
    recipientKind: choice({ required: true }),
    recipientName: text({ required: true, max: 200 }),
    method: choice({ required: true }),
    mailedOn: date({ required: true, earliest: '1900-01-01', latest: today }),
    reference: text({ max: 200 }),
  },
  capability: 'regional_impact.determine',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      recipientKind: 'Choose a recipient.',
      recipientName: NAME_COPY('the recipient name'),
      method: 'Choose a method.',
      mailedOn: {
        missing: 'Enter the date mailed.',
        impossible_date: 'Enter the date mailed as a date.',
        words: 'Enter the date mailed as a date.',
        otherwise: between('the date mailed'),
      },
      reference: 'Enter the reference of 200 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Notice recorded.' })
    expect(written).toEqual(['audit_log', 'clocks', 'regional_impact_notices'])
  },
})

describe('regional notice sweep findings', () => {
  it('names the date field for a notice mailed in 2099 and the name field for blank spaces', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await underReview()
    const base = {
      applicationId,
      recipientKind: 'regional_planning_commission',
      recipientName: 'Alder Pond RPC',
      method: 'certified_mail',
      mailedOn: '2026-06-12',
    }
    expect(await regionalNoticeAction(h.form({ ...base, mailedOn: '2099-01-01' }))).toEqual(
      refuseField('mailedOn', between('the date mailed')),
    )
    expect(await regionalNoticeAction(h.form({ ...base, recipientName: '   ' }))).toEqual(
      refuseField('recipientName', 'Enter the recipient name.'),
    )
  })

  it('refuses a determination dated in 2099', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await regionalImpactAction(
      h.form({
        applicationId: await underReview(),
        determination: 'yes',
        determinedOn: '2099-01-01',
      }),
    )
    expect(result).toEqual(refuseField('determinedOn', between('the determination date')))
  })

  it('names the board reference when a previous determination has none', async () => {
    h.signIn(await h.actorFor('staff'))
    const result = await regionalImpactAction(
      h.form({
        applicationId: await underReview(),
        determination: 'previously_determined',
        determinedOn: '2026-06-10',
      }),
    )
    expect(result).toEqual(
      refuseField('previousBoardRef', 'Enter the board reference for the earlier determination.'),
    )
  })
})
