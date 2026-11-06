import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { abutterListRecipients, abutterLists, applicationProfessionals } from '@/db/schema'
import { generateList } from '@/features/abutters/lists'
import { CHECK_PASSED } from '@/server/formInput'
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

const listMessage = () => idMessage('a list')
const reasonMessage = (v: InvalidVariant) => textMessage('a reason', 1000, v)

async function listRow(listId: string) {
  const [row] = await h.db.select().from(abutterLists).where(eq(abutterLists.id, listId))
  return row
}

describeActionCases(h, 'decideTenantAction', {
  invoke: actions.decideTenantAction,
  actor: staff,
  input: async () => {
    const listId = await freshDraft()
    return {
      listId,
      recipientId: await firstRecipient(listId),
      qualifies: 'yes',
      reason: 'Owns a unit on the site',
    }
  },
  fields: {
    listId: uuid({ required: true }),
    recipientId: uuid({ required: true }),
    qualifies: choice({ required: true }),
    reason: text({ required: true, max: 1000 }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      listId: listMessage,
      recipientId: () => idMessage('a recipient'),
      qualifies: () => 'Choose whether this tenant counts.',
      reason: reasonMessage,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Decision recorded.' })
    expect(written).toEqual(expect.arrayContaining(['abutter_list_recipients', 'audit_log']))
    const [row] = await db
      .select({
        qualifies: abutterListRecipients.qualifies,
        reason: abutterListRecipients.decisionReason,
      })
      .from(abutterListRecipients)
      .where(eq(abutterListRecipients.id, String(input.recipientId)))
    expect(row).toEqual({ qualifies: true, reason: 'Owns a unit on the site' })
  },
})

describeActionCases(h, 'attestCrossingsAction', {
  invoke: actions.attestCrossingsAction,
  actor: staff,
  input: async () => ({ listId: await freshDraft() }),
  fields: { listId: uuid({ required: true }) },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ listId: listMessage }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Recorded: streets and streams were reviewed.' })
    expect(written).toEqual(expect.arrayContaining(['abutter_lists', 'audit_log']))
    expect((await listRow(String(input.listId)))?.crossingsAttestedAt).not.toBeNull()
  },
})

describeActionCases(h, 'issueListAction', {
  invoke: actions.issueListAction,
  actor: staff,
  input: async () => ({ listId: await freshDraft() }),
  fields: { listId: uuid({ required: true }) },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ listId: listMessage }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'List issued. Notice costs were calculated from it.',
    })
    expect(written).toEqual(expect.arrayContaining(['abutter_lists', 'audit_log']))
    expect((await listRow(String(input.listId)))?.status).toBe('issued')
  },
})

describeActionCases(h, 'addProfessionalAction', {
  invoke: actions.addProfessionalAction,
  actor: staff,
  input: () => ({
    applicationId: lw.applicationId,
    name: 'Casey Marsh, PLS',
    profession: 'land_surveyor',
    businessAddress: '9 Survey Row, Alder Pond NH 03999',
    sealOnPlat: 'yes',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    name: text({ required: true, max: 200 }),
    profession: choice({ required: true }),
    businessAddress: text({ required: true, max: 300 }),
    sealOnPlat: choice({ required: true }),
  },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      applicationId: () => idMessage('an application'),
      name: (v) => textMessage('the name', 200, v),
      profession: () => 'Choose a profession.',
      businessAddress: (v) => textMessage('the business address', 300, v),
      sealOnPlat: () => 'Choose whether the seal is on the plat.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Professional added.' })
    expect(written).toEqual(expect.arrayContaining(['application_professionals', 'audit_log']))
    const rows = await db
      .select({
        name: applicationProfessionals.name,
        sealOnPlat: applicationProfessionals.sealOnPlat,
      })
      .from(applicationProfessionals)
      .where(eq(applicationProfessionals.applicationId, lw.applicationId))
    expect(rows).toContainEqual({ name: 'Casey Marsh, PLS', sealOnPlat: true })
  },
})
