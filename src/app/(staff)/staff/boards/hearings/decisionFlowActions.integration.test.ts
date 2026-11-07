import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { boardDecisions, regionalImpactParties } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { lazy } from '@/test/boardPanelFixtures'
import { decidedZba, heldZbaHearing, publishBoardTemplates } from '@/test/hearingFixtures'
import { proofDocument } from '@/test/noticeFixtures'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  type InvalidVariant,
  rolesLacking,
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
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./decisionActions')

const h = actionHarness()
h.useObjectStore()
const TODAY = new Date('2027-04-16T16:00:00Z')
const FULL_RANGE = { earliest: '1900-01-01', latest: '2099-12-31' }
const VOTES = [
  'Avery Stone: for',
  'Robin Vale: for',
  'Morgan Reed: for',
  'Casey Lund: for',
  'Drew Hale: against',
].join('\n')
let world: BoardWorld

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY })
  world = await setupBoardWorld(h.db, { zbaMeetings: ['2027-04-15'] })
  await publishRegionalContacts(h.db, world)
  await publishBoardTemplates(h.db, world)
})
afterAll(() => {
  vi.useRealTimers()
})

const decisionOf = (hearingId: string) =>
  h.db
    .select({
      id: boardDecisions.id,
      outcome: boardDecisions.outcome,
      votedOn: boardDecisions.votedOn,
    })
    .from(boardDecisions)
    .where(eq(boardDecisions.hearingId, hearingId))
    .then((rows) => rows[0])

const forRecording = lazy(() => heldZbaHearing(h.db, world))

function recordRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'applicationId':
      return refuseField('applicationId', idMessage('an application'))
    case 'hearingId':
      return refuseField('hearingId', idMessage('a hearing'))
    case 'votedOn':
      return refuseField('votedOn', dateMessage('the date of the vote', variant))
    case 'outcome':
      return refuseField('outcome', 'Choose an outcome.')
    case 'motion':
      return refuseField('motion', textMessage('the motion', 2000, variant))
    case 'findings':
      return refuseField('findings', textMessage('the findings', 10000, variant))
    case 'conditions':
      return refuseField('conditions', textMessage('the conditions', 10000, variant))
    default:
      return refuseField('reasons', textMessage('the reasons', 10000, variant))
  }
}

async function decisionInput() {
  const held = await forRecording()
  return {
    applicationId: held.applicationId,
    hearingId: held.hearingId,
    votedOn: '2027-04-15',
    outcome: 'approved',
    motion: 'Move to approve as presented.',
    votes: VOTES,
    findings: 'The proposal meets each criterion of the ordinance.',
    conditions: 'Before issuance: Submit a stormwater plan.\nPlant two trees.',
  }
}

describe('recordDecisionAction with votes and reasons the form cannot take', () => {
  it.each([
    ['no votes', ''],
    ['a line with no vote', 'Avery Stone'],
    ['an unknown vote word', 'Avery Stone: maybe'],
  ])('refuses %s beside the Votes field and records nothing', async (_name, votes) => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ ...(await decisionInput()), votes })
    const { value, written } = await h.recordWrites(() => actions.recordDecisionAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('votes', 'Enter one vote per line, like "Pat Rowe: for".'),
      written: [],
    })
  })

  it('refuses a vote dated after today beside the Date field', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ ...(await decisionInput()), votedOn: '2027-06-01' })
    expect(await actions.recordDecisionAction(form)).toEqual(
      refuseField('votedOn', 'The date cannot be in the future.'),
    )
  })

  it('refuses a denial with no reasons and records nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ ...(await decisionInput()), outcome: 'denied' })
    const { value, written } = await h.recordWrites(() => actions.recordDecisionAction(form))
    expect({ value, written }).toEqual({
      value: {
        ok: false,
        error: 'The decision cannot be recorded yet. Still needed: Reasons for disapproval.',
      },
      written: [],
    })
  })
})

describeActionCases(h, 'recordDecisionAction', {
  invoke: actions.recordDecisionAction,
  actor: () => h.actorFor('admin'),
  input: decisionInput,
  fields: {
    applicationId: uuid({ required: true }),
    hearingId: uuid({ required: true }),
    votedOn: date({ required: true, ...FULL_RANGE }),
    outcome: choice({ required: true }),
    motion: text({ required: true, max: 2000 }),
    findings: text({ required: true, max: 10000 }),
    conditions: text({ max: 10000 }),
    reasons: text({ max: 10000 }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: recordRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Decision recorded. The filing deadline has started.',
    })
    expect(await decisionOf(String(input.hearingId))).toMatchObject({
      outcome: 'approved',
      votedOn: '2027-04-15',
    })
  },
})

const forDocuments = lazy(() => decidedZba(h.db, world, h.store, { documents: false }))

describeActionCases(h, 'generateDecisionDocumentsAction', {
  invoke: actions.generateDecisionDocumentsAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ decisionId: (await forDocuments()).decisionId }),
  fields: { decisionId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('decisionId', idMessage('a decision')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Notice of Decision and decision letter created.',
    })
    expect(written).toContain('documents')
    const [row] = await db
      .select({ written: boardDecisions.writtenDecisionDocumentId })
      .from(boardDecisions)
      .where(eq(boardDecisions.id, String(input.decisionId)))
    expect(row?.written).not.toBeNull()
  },
})

const forFiling = lazy(async () => {
  const decided = await decidedZba(h.db, world, h.store)
  return {
    decisionId: decided.decisionId,
    minutesDocumentId: await proofDocument(h.db, world, decided.applicationId),
  }
})

function filingRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'decisionId':
      return refuseField('decisionId', idMessage('a decision'))
    case 'filedOn':
      return refuseField('filedOn', dateMessage('the date filed', variant))
    default:
      return refuseField('minutesDocumentId', idMessage('the minutes'))
  }
}

describe('fileDecisionAction with dates the feature refuses', () => {
  it('refuses a filing dated before the vote beside the Date field and files nothing', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({ ...(await forFiling()), filedOn: '2027-04-01' })
    const { value, written } = await h.recordWrites(() => actions.fileDecisionAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('filedOn', 'The decision cannot be filed before the date of the vote.'),
      written: [],
    })
  })

  it('refuses a filing dated after today beside the Date field', async () => {
    h.signIn(await h.actorFor('staff'))
    const form = h.form({ ...(await forFiling()), filedOn: '2027-06-01' })
    expect(await actions.fileDecisionAction(form)).toEqual(
      refuseField('filedOn', 'The date cannot be in the future.'),
    )
  })
})

describeActionCases(h, 'fileDecisionAction', {
  invoke: actions.fileDecisionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ ...(await forFiling()), filedOn: '2027-04-16' }),
  fields: {
    decisionId: uuid({ required: true }),
    filedOn: date({ required: true, ...FULL_RANGE }),
    minutesDocumentId: uuid({ required: true }),
  },
  refusedRoles: ROLES.filter(
    (role) =>
      rolesLacking('board.record').includes(role) ||
      rolesLacking('document.publish').includes(role),
  ),
  refusals: { ...STAFF_REFUSALS, invalid: filingRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Decision and minutes filed and shown on the public site.',
    })
    const [row] = await db
      .select({ filedOn: boardDecisions.filedOn })
      .from(boardDecisions)
      .where(eq(boardDecisions.id, String(input.decisionId)))
    expect(row).toEqual({ filedOn: '2027-04-16' })
  },
})

const forTransmittal = lazy(async () => {
  const regional = await decidedZba(h.db, world, h.store, { regional: 'yes' })
  await h.db
    .insert(regionalImpactParties)
    .values({ applicationId: regional.applicationId, municipalityKey: 'pine_river' })
  return regional.decisionId
})

describeActionCases(h, 'transmittalAction', {
  invoke: actions.transmittalAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ decisionId: await forTransmittal() }),
  fields: { decisionId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('decisionId', idMessage('a decision')),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Transmittal checklist is ready. Record proof for each recipient.',
    })
    expect(written).toContain('notice_sets')
  },
})
