import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { logRequest, rtkRequestView } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { ACKNOWLEDGING_PACK } from '@/test/packs/acknowledgingPack'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

async function logged(): Promise<string> {
  const r = await logRequest(
    handle.db,
    staff,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'email',
      requesterName: 'Jordan Reyes',
      requesterContact: 'jordan@example.test',
      description: 'All permits issued on Birch Lane since 2024',
    },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(`log failed ${r.error}`)
  return r.value.requestId
}

const respond = (input: Parameters<typeof recordFirstResponse>[3]) =>
  recordFirstResponse(handle.db, store, staff, input, signal, NOW)

const rowOf = async (requestId: string) =>
  (await handle.db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId)))[0]

const statement = {
  statedDate: d('2027-07-30'),
  delayReason: 'The records are in off-site storage and must be retrieved and reviewed.',
  costEstimate: [],
}

describe('under a pack that accepts an acknowledgement', () => {
  beforeEach(() => {
    setActivePackForTest(ACKNOWLEDGING_PACK)
  })
  afterEach(() => {
    setActivePackForTest(null)
  })

  it('acknowledging on day 3 meets the response clock and leaves the request responded', async () => {
    const requestId = await logged()
    const r = await respond({
      requestId,
      kind: 'acknowledged',
      respondedOn: d('2027-07-05'),
      clarification: 'Which years do you mean?',
    })
    expect(r.ok).toBe(true)
    const row = await rowOf(requestId)
    expect(row?.status).toBe('responded')
    expect(row?.firstResponseKind).toBe('acknowledged')
    expect(row?.firstResponseOn).toBe('2027-07-05')
    expect(row?.acknowledgedOn).toBe('2027-07-05')
    expect(row?.clarificationQuestion).toBe('Which years do you mean?')
    expect(row?.openDueOn).toBeNull()
    const view = await rtkRequestView(handle.db, staff, requestId, d('2027-07-05'), signal)
    expect(view.ok && view.value.timeliness.kind).toBe('responded_on_time')
  })

  it('a later time statement still records and keeps the acknowledgement date', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    const r = await respond({
      requestId,
      kind: 'time_statement',
      respondedOn: d('2027-07-09'),
      timeStatement: statement,
    })
    expect(r.ok).toBe(true)
    const row = await rowOf(requestId)
    expect(row?.status).toBe('awaiting_decision')
    expect(row?.firstResponseKind).toBe('time_statement')
    expect(row?.firstResponseOn).toBe('2027-07-05')
    expect(row?.acknowledgedOn).toBe('2027-07-05')
    expect(row?.openDueOn).toBe('2027-07-30')
  })

  it('a later website reference records after the acknowledgement', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    const r = await respond({
      requestId,
      kind: 'website_reference',
      respondedOn: d('2027-07-09'),
      websiteUrl: 'https://town.example/records',
    })
    expect(r.ok).toBe(true)
    const row = await rowOf(requestId)
    expect(row?.firstResponseKind).toBe('website_reference')
    expect(row?.firstResponseUrl).toBe('https://town.example/records')
    expect(row?.firstResponseOn).toBe('2027-07-05')
  })

  it('a second acknowledgement is already_responded', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    const r = await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-06') })
    expect(r).toEqual({ ok: false, error: 'already_responded' })
  })

  it('a substantive response closes off further responses', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    await respond({
      requestId,
      kind: 'website_reference',
      respondedOn: d('2027-07-09'),
      websiteUrl: 'https://town.example/records',
    })
    const r = await respond({
      requestId,
      kind: 'time_statement',
      respondedOn: d('2027-07-10'),
      timeStatement: statement,
    })
    expect(r).toEqual({ ok: false, error: 'already_responded' })
  })
})

describe('under New Hampshire', () => {
  it('refuses an acknowledgement', async () => {
    const requestId = await logged()
    const r = await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    expect(r).toEqual({ ok: false, error: 'acknowledgement_unavailable' })
    expect((await rowOf(requestId))?.status).toBe('open')
  })

  it('still refuses a second response once the first is recorded', async () => {
    const requestId = await logged()
    await respond({
      requestId,
      kind: 'website_reference',
      respondedOn: d('2027-07-05'),
      websiteUrl: 'https://town.example/records',
    })
    const r = await respond({
      requestId,
      kind: 'time_statement',
      respondedOn: d('2027-07-06'),
      timeStatement: statement,
    })
    expect(r).toEqual({ ok: false, error: 'already_responded' })
  })
})
