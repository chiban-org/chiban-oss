import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  acceptanceSchedules,
  applications,
  clocks,
  desProximityDeterminations,
  regionalImpactDeterminations,
  regionalImpactParties,
  trcRoutings,
} from '@/db/schema'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  publishRegionalContacts,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import {
  acceptedApplication,
  applicationWithMeetingSet,
  decidedVariance,
  filedApplication,
  lazy,
} from '@/test/boardPanelFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { staffActor } from '@/test/parcels'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const actions = await import('./actions')
const hearingActions = await import('./hearings/actions')

const h = actionHarness()
let world: BoardWorld

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: BOARD_FIXTURE_NOW })
  world = await setupBoardWorld(h.db)
  await publishRegionalContacts(h.db, world)
})
afterAll(() => {
  vi.useRealTimers()
})

const FULL_RANGE = { earliest: '1900-01-01', latest: '2099-12-31' }

function desRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'applicationId':
      return refuseField('applicationId', idMessage('an application'))
    case 'determination':
      return refuseField('determination', 'Choose a determination.')
    default:
      return refuseField('reason', textMessage('a reason', 1000, variant))
  }
}

describeActionCases(h, 'desDeterminationAction', {
  invoke: actions.desDeterminationAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    applicationId: await forDes(),
    determination: 'not_applicable',
    reason: 'No parcel layer is loaded for this town, so the proximity was checked by hand.',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    determination: choice({ required: true }),
    reason: text({ max: 1000 }),
  },
  capability: 'abutters.manage',
  refusals: { ...STAFF_REFUSALS, invalid: desRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Determination recorded.' })
    const [row] = await db
      .select({ determination: desProximityDeterminations.determination })
      .from(desProximityDeterminations)
      .where(eq(desProximityDeterminations.applicationId, String(input.applicationId)))
    expect(row).toEqual({ determination: 'not_applicable' })
  },
})

describe('desDeterminationAction without a reason', () => {
  it('refuses beside the Reason field and records nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const applicationId = await submitBoardApplication(h.db, world, world.pbTypeKey, '2027-03-25')
    const form = h.form({ applicationId, determination: 'not_within' })
    const { value, written } = await h.recordWrites(() => actions.desDeterminationAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('reason', 'Enter a reason of at least 10 characters.'),
      written: [],
    })
  })
})

describe('finalApprovalAction with a future date', () => {
  it('refuses beside the Date field and starts no clock', async () => {
    h.signIn(await h.actorFor('admin'))
    const applicationId = await decidedVariance(h.db, world)
    const form = h.form({ applicationId, finalOn: '2028-06-01' })
    const { value, written } = await h.recordWrites(() => actions.finalApprovalAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('finalOn', 'The date cannot be in the future.'),
      written: [],
    })
  })
})

function finalRefusal(variant: InvalidVariant) {
  return variant.field === 'applicationId'
    ? refuseField('applicationId', idMessage('an application'))
    : refuseField('finalOn', dateMessage('the date of final approval', variant))
}

describeActionCases(h, 'finalApprovalAction', {
  invoke: actions.finalApprovalAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ applicationId: await forFinal(), finalOn: '2027-05-12' }),
  fields: {
    applicationId: uuid({ required: true }),
    finalOn: date({ required: true, ...FULL_RANGE }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: finalRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Final approval recorded. The deadline to exercise it is on the clocks.',
    })
    const rows = await db
      .select({ ruleKey: clocks.ruleKey, currentDue: clocks.currentDue })
      .from(clocks)
      .where(eq(clocks.applicationId, String(input.applicationId)))
    expect(rows).toContainEqual({ ruleKey: 'nh.zba.exercise', currentDue: '2029-05-12' })
  },
})

const forDes = lazy(() => submitBoardApplication(h.db, world, world.pbTypeKey, '2027-03-24'))
const forFinal = lazy(() => decidedVariance(h.db, world))

function pairRefusal(first: string, firstNoun: string, second: string, secondNoun: string) {
  return (variant: InvalidVariant) =>
    variant.field === first
      ? refuseField(first, idMessage(firstNoun))
      : refuseField(second, idMessage(secondNoun))
}

const forRouting = lazy(async () => {
  const reviewers = [
    await staffActor(h.db, 'reviewer'),
    await staffActor(h.db, 'reviewer'),
    await staffActor(h.db, 'reviewer'),
  ]
  const body: ReviewRoutesBody = {
    key: 'default',
    departments: [
      { key: 'fire', label: 'Fire', reviewerUserIds: [reviewers[0]?.userId ?? ''] },
      { key: 'public_works', label: 'Public Works', reviewerUserIds: [reviewers[1]?.userId ?? ''] },
      { key: 'police', label: 'Police', reviewerUserIds: [reviewers[2]?.userId ?? ''] },
    ],
    routes: [
      {
        applicationTypeKey: world.pbTypeKey,
        departmentKeys: ['fire', 'public_works', 'police'],
        commentDueDaysBeforeMeeting: 7,
      },
    ],
  }
  await saveAndPublish(h.db, world.admin, 'review_routes', 'default', body)
  const applicationId = await submitBoardApplication(h.db, world, world.pbTypeKey, '2027-03-24')
  const meeting = await h.db.query.boardMeetings.findFirst({
    where: (m, { and, eq: equals }) =>
      and(equals(m.meetingDate, '2027-04-14'), equals(m.board, 'planning_board')),
  })
  return { applicationId, meetingId: meeting?.id ?? '' }
})

describeActionCases(h, 'routeToTrcAction', {
  invoke: hearingActions.routeToTrcAction,
  actor: () => h.actorFor('admin'),
  input: forRouting,
  fields: { applicationId: uuid({ required: true }), meetingId: uuid() },
  capability: 'review.assign',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: pairRefusal('applicationId', 'an application', 'meetingId', 'a meeting'),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Sent to the Technical Review Committee departments.',
    })
    const rows = await db
      .select({ department: trcRoutings.departmentKey, due: trcRoutings.commentDue })
      .from(trcRoutings)
      .where(eq(trcRoutings.applicationId, String(input.applicationId)))
    expect(rows.map((r) => r.department).sort()).toEqual(['fire', 'police', 'public_works'])
    expect(rows.every((r) => r.due === '2027-04-07')).toBe(true)
  },
})
