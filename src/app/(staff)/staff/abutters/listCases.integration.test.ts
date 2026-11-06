import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { abutterListCandidates, abutterListRecipients, abutterLists } from '@/db/schema'
import { generateList } from '@/features/abutters/lists'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { refusalBy } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
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

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
let world: BoardWorld
let lw: ListWorld

beforeAll(async () => {
  world = await setupBoardWorld(h.db)
  lw = await prepareListWorld(h.db, world)
})

const staff = () => h.actorFor('staff')

async function freshDraft(): Promise<string> {
  await h.db
    .update(abutterLists)
    .set({ status: 'discarded' })
    .where(eq(abutterLists.status, 'draft'))
  const made = await generateList(
    h.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    LIST_NOW,
  )
  if (!made.ok) throw new Error(String(made.error))
  return made.value.listId
}

async function firstRecipient(listId: string): Promise<string> {
  const [row] = await h.db
    .select({ id: abutterListRecipients.id })
    .from(abutterListRecipients)
    .where(eq(abutterListRecipients.listId, listId))
  if (row === undefined) throw new Error('the draft has no recipient')
  return row.id
}

async function firstCandidate(listId: string): Promise<string> {
  const [row] = await h.db
    .select({ parcelId: abutterListCandidates.parcelId })
    .from(abutterListCandidates)
    .where(eq(abutterListCandidates.listId, listId))
  if (row === undefined) throw new Error('the draft has no candidate')
  return row.parcelId
}

const listMessage = () => idMessage('a list')
const reasonMessage = (v: InvalidVariant) => textMessage('a reason', 1000, v)

describeActionCases(h, 'generateListAction', {
  invoke: actions.generateListAction,
  actor: staff,
  input: () => ({ applicationId: lw.applicationId }),
  fields: { applicationId: uuid({ required: true }) },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ applicationId: () => idMessage('an application') }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: expect.stringMatching(/^Draft list version \d+ drawn\.$/),
    })
    expect(written).toEqual(expect.arrayContaining(['abutter_lists', 'audit_log']))
    const drafts = await db
      .select({ id: abutterLists.id })
      .from(abutterLists)
      .where(
        and(eq(abutterLists.applicationId, lw.applicationId), eq(abutterLists.status, 'draft')),
      )
    expect(drafts).toHaveLength(1)
  },
})

describeActionCases(h, 'selectParcelAction', {
  invoke: actions.selectParcelAction,
  actor: staff,
  input: async () => ({
    listId: await freshDraft(),
    parcelRef: '009011000000',
    crossing: 'street',
    note: 'Across the road from the frontage',
  }),
  fields: {
    listId: uuid({ required: true }),
    parcelRef: text({ required: true, max: 200 }),
    crossing: choice({ required: true }),
    note: text({ required: true, max: 1000 }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      listId: listMessage,
      parcelRef: (v) => textMessage('the parcel', 200, v),
      crossing: () => 'Choose street or stream.',
      note: (v) => textMessage('why this parcel belongs on the list', 1000, v),
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Parcel added to the list.' })
    expect(written).toEqual(expect.arrayContaining(['abutter_list_candidates', 'audit_log']))
    const rows = await db
      .select({ reasons: abutterListCandidates.reasons })
      .from(abutterListCandidates)
      .where(eq(abutterListCandidates.listId, String(input.listId)))
    expect(JSON.stringify(rows)).toContain('Across the road from the frontage')
  },
})

describeActionCases(h, 'excludeCandidateAction', {
  invoke: actions.excludeCandidateAction,
  actor: staff,
  input: async () => {
    const listId = await freshDraft()
    return { listId, parcelId: await firstCandidate(listId), reason: 'Owned by the applicant' }
  },
  fields: {
    listId: uuid({ required: true }),
    parcelId: uuid({ required: true }),
    reason: text({ required: true, max: 1000 }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      listId: listMessage,
      parcelId: () => idMessage('a parcel'),
      reason: reasonMessage,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Parcel left off the list.' })
    expect(written).toEqual(expect.arrayContaining(['abutter_list_candidates', 'audit_log']))
    const [row] = await db
      .select({
        excluded: abutterListCandidates.excluded,
        reason: abutterListCandidates.exclusionReason,
      })
      .from(abutterListCandidates)
      .where(
        and(
          eq(abutterListCandidates.listId, String(input.listId)),
          eq(abutterListCandidates.parcelId, String(input.parcelId)),
        ),
      )
    expect(row).toEqual({ excluded: true, reason: 'Owned by the applicant' })
  },
})

describeActionCases(h, 'correctRecipientAction', {
  invoke: actions.correctRecipientAction,
  actor: staff,
  input: async () => {
    const listId = await freshDraft()
    return {
      listId,
      recipientId: await firstRecipient(listId),
      name: 'Wren, Isolde',
      mailingAddress: '4 Heron Way, Alder Pond NH 03999',
      reason: 'Owner moved',
    }
  },
  fields: {
    listId: uuid({ required: true }),
    recipientId: uuid({ required: true }),
    name: text({ required: true, max: 200 }),
    mailingAddress: text({ required: true, max: 300 }),
    reason: text({ required: true, max: 1000 }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      listId: listMessage,
      recipientId: () => idMessage('a recipient'),
      name: (v) => textMessage('the name', 200, v),
      mailingAddress: (v) => textMessage('the mailing address', 300, v),
      reason: reasonMessage,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Name and address updated.' })
    expect(written).toEqual(expect.arrayContaining(['abutter_list_recipients', 'audit_log']))
    const [row] = await db
      .select({ data: abutterListRecipients.data })
      .from(abutterListRecipients)
      .where(eq(abutterListRecipients.id, String(input.recipientId)))
    expect(row?.data).toMatchObject({
      name: 'Wren, Isolde',
      mailingAddress: '4 Heron Way, Alder Pond NH 03999',
    })
  },
})

describe('abutter list refusals the feature owns', () => {
  it('names the parcel field for a parcel ID that is not on file', async () => {
    h.signIn(await staff())
    const form = h.form({
      listId: await freshDraft(),
      parcelRef: '999999999999',
      crossing: 'street',
      note: 'Across the road',
    })
    const outcome = await h.recordWrites(() => actions.selectParcelAction(form))
    expect(outcome).toEqual({
      value: refuseField('parcelRef', 'That parcel ID was not found.'),
      written: [],
    })
  })

  it('names the reason field for a reason of three spaces when leaving a parcel off', async () => {
    h.signIn(await staff())
    const listId = await freshDraft()
    const form = h.form({ listId, parcelId: await firstCandidate(listId), reason: '   ' })
    const outcome = await h.recordWrites(() => actions.excludeCandidateAction(form))
    expect(outcome).toEqual({ value: refuseField('reason', 'Enter a reason.'), written: [] })
  })
})
