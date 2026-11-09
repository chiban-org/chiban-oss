import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { hearings, noticeProofs } from '@/db/schema'
import { markProperlyNoticed } from '@/features/hearings/hearings'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { dateMessage, idMessage, textMessage } from '@/test/boardCases'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { lazy, meetingIdOn } from '@/test/boardPanelFixtures'
import { provenZbaHearing, scheduledZbaHearing } from '@/test/hearingFixtures'
import { firstChannelProof, issueListWithRecipients, recipient } from '@/test/noticeFixtures'
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

vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal
const TODAY = new Date('2027-04-16T16:00:00Z')
const FULL_RANGE = { earliest: '1900-01-01', latest: '2099-12-31' }
let world: BoardWorld

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY })
  world = await setupBoardWorld(h.db, { zbaMeetings: ['2027-04-15', '2027-05-20'] })
})
afterAll(() => {
  vi.useRealTimers()
})

const hearingOf = (id: string) =>
  h.db
    .select({
      status: hearings.status,
      heldOn: hearings.heldOn,
      properlyNoticedAt: hearings.properlyNoticedAt,
    })
    .from(hearings)
    .where(eq(hearings.id, id))
    .then((rows) => rows[0])

function idRefusal(field: string, noun: string) {
  return (variant: InvalidVariant) =>
    variant.field === field ? refuseField(field, idMessage(noun)) : null
}

const forScheduling = lazy(async () => {
  const applicationId = await submitBoardApplication(h.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(h.db, world, applicationId)
  await issueListWithRecipients(h.db, world, applicationId, [recipient(1), recipient(2)])
  return { applicationId, meetingId: await meetingIdOn(h.db, '2027-04-15', 'zba') }
})

function scheduleRefusal(variant: InvalidVariant) {
  if (variant.field === 'kind') return refuseField('kind', 'Choose a kind of hearing.')
  return (
    idRefusal('applicationId', 'an application')(variant) ??
    refuseField('meetingId', idMessage('a meeting'))
  )
}

describeActionCases(h, 'scheduleHearingAction', {
  invoke: actions.scheduleHearingAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ ...(await forScheduling()), kind: 'public_hearing' }),
  fields: {
    applicationId: uuid({ required: true }),
    meetingId: uuid({ required: true }),
    kind: choice({ required: true }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: scheduleRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Hearing scheduled. The notice checklist is ready.',
    })
    const rows = await db
      .select({ status: hearings.status, kind: hearings.kind })
      .from(hearings)
      .where(eq(hearings.applicationId, String(input.applicationId)))
    expect(rows).toEqual([{ status: 'scheduled', kind: 'public_hearing' }])
  },
})

const forProof = lazy(async () => {
  const hearing = await scheduledZbaHearing(h.db, world)
  const proof = await firstChannelProof(h.db, world, hearing.applicationId, hearing.noticeSetId)
  return { hearing, proof }
})

function proofRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'method':
      return refuseField('method', 'Choose a method of notice.')
    case 'reference':
      return refuseField('reference', textMessage('the tracking number', 200, variant))
    case 'effectiveOn':
      return refuseField('effectiveOn', dateMessage('the date of the proof', variant))
    default:
      return refuseField('documentId', idMessage('the certificate or receipt'))
  }
}

async function proofInput() {
  const { proof } = await forProof()
  return { ...proof, effectiveOn: '2027-03-30' }
}

describeActionCases(h, 'recordProofAction', {
  invoke: actions.recordProofAction,
  actor: () => h.actorFor('admin'),
  input: proofInput,
  fields: {
    method: choice({ required: true }),
    reference: text({ max: 200 }),
    effectiveOn: date({ required: true, ...FULL_RANGE }),
    documentId: uuid({ required: true }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: proofRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Proof recorded.' })
    const rows = await db
      .select({ effectiveOn: noticeProofs.effectiveOn, method: noticeProofs.method })
      .from(noticeProofs)
    expect(rows).toContainEqual({ effectiveOn: '2027-03-30', method: input.method })
  },
})

describe('recordProofAction with the feature errors beside their fields', () => {
  it('refuses a proof with no items ticked beside the items', async () => {
    h.signIn(await h.actorFor('admin'))
    const { proof } = await forProof()
    const form = h.form({ ...proof, itemIds: [], effectiveOn: '2027-03-30' })
    expect(await actions.recordProofAction(form)).toEqual(
      refuseField('itemIds', 'Choose at least one notice item.'),
    )
  })

  it('refuses a proof dated after today beside the Date field', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ ...(await proofInput()), effectiveOn: '2027-06-01' })
    expect(await actions.recordProofAction(form)).toEqual(
      refuseField('effectiveOn', 'The date cannot be in the future.'),
    )
  })
})

const forNoticing = lazy(() => provenZbaHearing(h.db, world))

describeActionCases(h, 'markProperlyNoticedAction', {
  invoke: actions.markProperlyNoticedAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ hearingId: (await forNoticing()).hearingId }),
  fields: { hearingId: uuid({ required: true }) },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('hearingId', idMessage('a hearing')),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input }) => {
    expect(result).toEqual({ ok: true, message: 'Marked properly noticed.' })
    expect((await hearingOf(String(input.hearingId)))?.properlyNoticedAt).not.toBeNull()
  },
})

const forContinuing = lazy(async () => ({
  hearing: await scheduledZbaHearing(h.db, world),
  toMeetingId: await meetingIdOn(h.db, '2027-05-20', 'zba'),
}))

function continueRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'hearingId':
      return refuseField('hearingId', idMessage('a hearing'))
    case 'toMeetingId':
      return refuseField('toMeetingId', idMessage('the new meeting'))
    case 'announced':
      return refuseField('announced', 'Choose whether it was announced.')
    default:
      return refuseField('details', textMessage('what was announced', 1000, variant))
  }
}

describe('continueHearingAction announced without details', () => {
  it('refuses beside the details field and continues nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const { hearing, toMeetingId } = await forContinuing()
    const form = h.form({ hearingId: hearing.hearingId, toMeetingId, announced: 'yes' })
    const { value, written } = await h.recordWrites(() => actions.continueHearingAction(form))
    expect({ value, written }).toEqual({
      value: refuseField(
        'details',
        'Enter the date, time, and place that were announced at the meeting.',
      ),
      written: [],
    })
  })
})

describeActionCases(h, 'continueHearingAction', {
  invoke: actions.continueHearingAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    const { hearing, toMeetingId } = await forContinuing()
    return { hearingId: hearing.hearingId, toMeetingId, announced: 'no' }
  },
  fields: {
    hearingId: uuid({ required: true }),
    toMeetingId: uuid({ required: true }),
    announced: choice({ required: true }),
    details: text({ max: 1000 }),
  },
  capability: 'board.record',
  refusals: { ...STAFF_REFUSALS, invalid: continueRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Hearing continued. New notice is required for the new date.',
    })
    const { hearing, toMeetingId } = await forContinuing()
    const rows = await db
      .select({ meetingId: hearings.meetingId })
      .from(hearings)
      .where(eq(hearings.applicationId, hearing.applicationId))
    expect(rows.map((r) => r.meetingId).sort()).toEqual([hearing.meetingId, toMeetingId].sort())
  },
})

const forHolding = lazy(async () => {
  const hearing = await provenZbaHearing(h.db, world)
  const noticed = await markProperlyNoticed(h.db, world.staff, hearing.hearingId, signal, TODAY)
  if (!noticed.ok) throw new Error(JSON.stringify(noticed.error))
  return hearing
})

describe('markHeldAction with dates the feature refuses', () => {
  it('refuses a date before the meeting beside the Date field and holds nothing', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ hearingId: (await forHolding()).hearingId, heldOn: '2027-04-01' })
    const { value, written } = await h.recordWrites(() => actions.markHeldAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('heldOn', 'The date cannot be before the meeting.'),
      written: [],
    })
  })

  it('refuses a date after today beside the Date field', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ hearingId: (await forHolding()).hearingId, heldOn: '2027-06-01' })
    expect(await actions.markHeldAction(form)).toEqual(
      refuseField('heldOn', 'The date cannot be in the future.'),
    )
  })
})

describeActionCases(h, 'markHeldAction', {
  invoke: actions.markHeldAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({ hearingId: (await forHolding()).hearingId, heldOn: '2027-04-15' }),
  fields: {
    hearingId: uuid({ required: true }),
    heldOn: date({ required: true, ...FULL_RANGE }),
  },
  capability: 'board.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      variant.field === 'hearingId'
        ? refuseField('hearingId', idMessage('a hearing'))
        : refuseField('heldOn', dateMessage('the date the hearing was held', variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input }) => {
    expect(result).toEqual({ ok: true, message: 'Hearing marked as held.' })
    expect(await hearingOf(String(input.hearingId))).toMatchObject({
      status: 'held',
      heldOn: '2027-04-15',
    })
  },
})
