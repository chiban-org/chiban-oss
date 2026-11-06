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

const forVote = lazy(() => applicationWithMeetingSet(h.db, world))
const forCertification = lazy(() => acceptedApplication(h.db, world))
const forRegional = lazy(() => acceptedApplication(h.db, world))

async function settingInput() {
  const meeting = await h.db.query.boardMeetings.findFirst({
    where: (m, { eq: equals }) => equals(m.meetingDate, '2027-04-28'),
  })
  const applicationId = await filedApplication(h.db, world, '2027-03-10')
  return { applicationId, meetingId: meeting?.id ?? '' }
}
const settingState = lazy(settingInput)

function pairRefusal(first: string, firstNoun: string, second: string, secondNoun: string) {
  return (variant: InvalidVariant) =>
    variant.field === first
      ? refuseField(first, idMessage(firstNoun))
      : refuseField(second, idMessage(secondNoun))
}

describeActionCases(h, 'setAcceptanceMeetingAction', {
  invoke: actions.setAcceptanceMeetingAction,
  actor: () => h.actorFor('admin'),
  input: settingState,
  fields: { applicationId: uuid({ required: true }), meetingId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: pairRefusal('applicationId', 'an application', 'meetingId', 'a meeting'),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Meeting set. The filing deadline for it is shown on the clocks.',
    })
    const [row] = await db
      .select({ meetingId: acceptanceSchedules.meetingId })
      .from(acceptanceSchedules)
      .where(eq(acceptanceSchedules.applicationId, String(input.applicationId)))
    expect(row).toEqual({ meetingId: input.meetingId })
  },
})

function voteRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'applicationId':
      return refuseField('applicationId', idMessage('an application'))
    case 'meetingId':
      return refuseField('meetingId', idMessage('a meeting'))
    case 'votedOn':
      return refuseField('votedOn', dateMessage('the date of the vote', variant))
    case 'outcome':
      return refuseField('outcome', 'Choose an outcome.')
    default:
      return refuseField('reason', textMessage('a reason', 1000, variant))
  }
}

describeActionCases(h, 'completenessVoteAction', {
  invoke: actions.completenessVoteAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ ...(await forVote()), votedOn: '2027-04-14', outcome: 'accepted' }),
  fields: {
    applicationId: uuid({ required: true }),
    meetingId: uuid({ required: true }),
    votedOn: date({ required: true, ...FULL_RANGE }),
    outcome: choice({ required: true }),
    reason: text({ max: 1000 }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: voteRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Vote recorded.' })
    const [app] = await db
      .select({ state: applications.state, completedDate: applications.completedDate })
      .from(applications)
      .where(eq(applications.id, String(input.applicationId)))
    expect(app).toEqual({ state: 'under_review', completedDate: '2027-04-14' })
  },
})

function certificationRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'applicationId':
      return refuseField('applicationId', idMessage('an application'))
    case 'requestedOn':
      return refuseField('requestedOn', dateMessage('the date requested', variant))
    case 'outcome':
      return refuseField('outcome', 'Choose an outcome.')
    default:
      return refuseField('decidedOn', dateMessage('the date decided', variant))
  }
}

describeActionCases(h, 'certificationAction', {
  invoke: actions.certificationAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    applicationId: (await forCertification()).applicationId,
    requestedOn: '2027-06-19',
    outcome: 'certified',
    decidedOn: '2027-06-25',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    requestedOn: date({ required: true, ...FULL_RANGE }),
    outcome: choice({ required: true }),
    decidedOn: date(FULL_RANGE),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: certificationRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Recorded.' })
    const [app] = await db
      .select({ state: applications.state, substep: applications.substep })
      .from(applications)
      .where(eq(applications.id, String(input.applicationId)))
    expect(app).toEqual({ state: 'decided', substep: 'certified_by_selectmen' })
  },
})

function regionalRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'applicationId':
      return refuseField('applicationId', idMessage('an application'))
    case 'determination':
      return refuseField('determination', 'Choose a determination.')
    default:
      return refuseField('previousBoardRef', textMessage('the board reference', 200, variant))
  }
}

describeActionCases(h, 'boardRegionalImpactAction', {
  invoke: actions.boardRegionalImpactAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: (await forRegional()).applicationId,
    determination: 'yes',
    municipalityKeys: ['pine_river', 'dunmore'],
  }),
  fields: {
    applicationId: uuid({ required: true }),
    determination: choice({ required: true }),
    previousBoardRef: text({ max: 200 }),
  },
  capability: 'regional_impact.determine',
  refusals: { ...STAFF_REFUSALS, invalid: regionalRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Regional impact determination recorded.' })
    const [row] = await db
      .select({ determination: regionalImpactDeterminations.determination })
      .from(regionalImpactDeterminations)
      .where(eq(regionalImpactDeterminations.applicationId, String(input.applicationId)))
    expect(row).toEqual({ determination: 'yes' })
    const parties = await db
      .select({ key: regionalImpactParties.municipalityKey })
      .from(regionalImpactParties)
      .where(eq(regionalImpactParties.applicationId, String(input.applicationId)))
    expect(parties.map((p) => p.key).sort()).toEqual(['dunmore', 'pine_river'])
  },
})

describe('boardRegionalImpactAction with the feature errors beside their fields', () => {
  it('refuses a yes with no municipality beside the municipality list', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({
      applicationId: (await forRegional()).applicationId,
      determination: 'yes',
    })
    expect(await actions.boardRegionalImpactAction(form)).toEqual(
      refuseField('municipalityKeys', 'Choose at least one affected municipality.'),
    )
  })

  it('refuses a previous determination with no board reference beside the Reference field', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({
      applicationId: (await forRegional()).applicationId,
      determination: 'previously_determined',
    })
    expect(await actions.boardRegionalImpactAction(form)).toEqual(
      refuseField('previousBoardRef', 'Enter the board reference for the earlier determination.'),
    )
  })
})
