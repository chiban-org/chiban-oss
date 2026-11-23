import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, decisionDeliveries, projectParties, users } from '@/db/schema'
import { PLACEHOLDER_PARTY_NAME } from '@/features/applications/applicantName'
import { planDeliveries } from '@/features/decisions/delivery'
import { loadDeliveryGroups } from '@/features/decisions/deliveryView'
import { setActivePackForTest } from '@/features/packs/registry'
import { boardLabel } from '@/features/packs/vocabulary'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  addAgentParty,
  decideUnderXx,
  deliver,
  deliveriesOf,
  dueClockOf,
  FULL_PACK,
  HEARING_DATE,
} from '@/test/deliveryFixtures'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(FULL_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: FULL_PACK,
    classificationKey: 'xx.board_variance',
  })
  await addAgentParty(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

describe('planning delivery of a recorded board decision', () => {
  it('plans one row per recipient the pack names', async () => {
    const made = await decideUnderXx(handle.db, world)
    const rows = await deliveriesOf(handle.db, made.applicationId)
    expect(rows.map((r) => [r.recipientRole, r.recipientName])).toEqual([
      ['agent', 'Pat Agent'],
      ['applicant', expect.any(String)],
      ['municipal_officers', 'Town council'],
      ['planning_board', boardLabel('planning_board')],
    ])
    expect(rows.every((r) => r.decisionId === made.decisionId && r.appealNodeId === null)).toBe(
      true,
    )
    expect(rows.every((r) => r.deliveredOn === null && r.method === null)).toBe(true)
    expect(rows.filter((r) => r.partyId !== null)).toHaveLength(2)
  })

  it('starts the delivery clock seven days after the vote', async () => {
    const made = await decideUnderXx(handle.db, world)
    const clock = await dueClockOf(handle.db, made.applicationId)
    expect(clock?.currentDue).toBe(addDays(d(HEARING_DATE), 7))
  })

  it('plans no row for a party that has been removed', async () => {
    await handle.db
      .update(projectParties)
      .set({ removedAt: new Date('2027-03-10T00:00:00Z') })
      .where(eq(projectParties.name, 'Pat Agent'))
    const made = await decideUnderXx(handle.db, world)
    const roles = (await deliveriesOf(handle.db, made.applicationId)).map((r) => r.recipientRole)
    expect(roles).not.toContain('agent')
    expect(roles).toHaveLength(3)
  })
})

describe('recording deliveries', () => {
  it('keeps the clock running until the last recipient, then meets it on the latest date', async () => {
    const made = await decideUnderXx(handle.db, world)
    const [first, second, third, fourth] = await deliveriesOf(handle.db, made.applicationId)
    const record = (id: string | undefined, on: string, method: 'mail' | 'hand' = 'mail') =>
      deliver(handle.db, world.staff, id ?? '', on, method)
    expect((await record(first?.id, '2027-04-17')).ok).toBe(true)
    expect((await record(second?.id, '2027-04-20', 'hand')).ok).toBe(true)
    expect((await record(third?.id, '2027-04-18')).ok).toBe(true)
    const running = await dueClockOf(handle.db, made.applicationId)
    expect(running?.status).toBe('running')
    expect(running?.metOn).toBeNull()
    expect((await record(fourth?.id, '2027-04-19')).ok).toBe(true)
    expect(await dueClockOf(handle.db, made.applicationId)).toMatchObject({
      status: 'met',
      metOn: '2027-04-20',
    })
    const stored = await deliveriesOf(handle.db, made.applicationId)
    expect(stored.find((r) => r.id === second?.id)).toMatchObject({
      method: 'hand',
      deliveredOn: '2027-04-20',
      recordedBy: world.staff.userId,
    })
  })

  it('writes an audit entry and lists the delivery for the decision page', async () => {
    const made = await decideUnderXx(handle.db, world)
    const [first] = await deliveriesOf(handle.db, made.applicationId)
    await deliver(handle.db, world.staff, first?.id ?? '', '2027-04-17')
    const groups = await loadDeliveryGroups(handle.db, made.applicationId, signal)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.methods.map((m) => m.value)).toEqual(['mail', 'hand'])
    expect(groups[0]?.dueText).toBe('April 22, 2027')
    expect(groups[0]?.rows.filter((r) => r.delivered !== null)).toHaveLength(1)
    const audit = await handle.db.query.auditLog.findMany({
      where: (a, { eq: same }) => same(a.action, 'decision.delivery_recorded'),
    })
    expect(audit).toHaveLength(1)
  })
})

async function applicantDisplayName(): Promise<string | null> {
  const [row] = await handle.db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, world.applicant.userId))
  return row?.displayName ?? null
}

describe('the names on planned decision deliveries', () => {
  it('names the applicant, not the portal placeholder party', async () => {
    const made = await decideUnderXx(handle.db, world)
    const applicant = (await deliveriesOf(handle.db, made.applicationId)).find(
      (r) => r.recipientRole === 'applicant',
    )
    expect(applicant?.recipientName).not.toBe(PLACEHOLDER_PARTY_NAME)
    expect(applicant?.recipientName).toBe(await applicantDisplayName())
  })

  it('names the applicant from the form ahead of the account display name', async () => {
    const made = await decideUnderXx(handle.db, world)
    const [app] = await handle.db
      .select({ values: applications.values })
      .from(applications)
      .where(eq(applications.id, made.applicationId))
    await handle.db
      .update(applications)
      .set({ values: { ...(app?.values as object), applicant_name: 'Wren Halloway' } })
      .where(eq(applications.id, made.applicationId))
    await handle.db
      .delete(decisionDeliveries)
      .where(eq(decisionDeliveries.decisionId, made.decisionId))
    await handle.db.transaction((tx) => planDeliveries(tx, { decisionId: made.decisionId }, signal))
    const applicant = (await deliveriesOf(handle.db, made.applicationId)).find(
      (r) => r.recipientRole === 'applicant',
    )
    expect(applicant?.recipientName).toBe('Wren Halloway')
  })

  it('capitalises the governing body as a recipient name', async () => {
    const made = await decideUnderXx(handle.db, world)
    const officers = (await deliveriesOf(handle.db, made.applicationId)).find(
      (r) => r.recipientRole === 'municipal_officers',
    )
    expect(officers?.recipientName).toBe('Town council')
  })
})
