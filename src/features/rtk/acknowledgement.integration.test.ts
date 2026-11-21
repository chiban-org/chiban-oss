import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { setActivePackForTest } from '@/features/packs/registry'
import { denyRequest } from '@/features/rtk/denial'
import { createRelease } from '@/features/rtk/releases'
import { logRequest, rtkRequestView } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { ACKNOWLEDGING_PACK } from '@/test/packs/acknowledgingPack'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { releasableRecord } from '@/test/rtkFixtures'
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

async function withheldInFull(requestId: string): Promise<void> {
  const withheld = await recordWithholding(
    handle.db,
    staff,
    {
      requestId,
      scope: 'withheld_in_full',
      recordDescription: 'Email from the town attorney about the Birch Lane variance',
      exemptionKey: 'nh.rtk.91a5.xii',
      explanation: 'The email is a confidential communication seeking legal advice from counsel.',
    },
    signal,
  )
  if (!withheld.ok) throw new Error(`withhold failed ${withheld.error}`)
}

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
    if (!view.ok) throw new Error('view failed')
    expect(view.value.timeliness.kind).toBe('responded_on_time')
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

  it('a release after the acknowledgement keeps the acknowledgement date and becomes made_available', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    const record = await releasableRecord(handle.db, store, staff, requestId)
    const released = await createRelease(
      handle.db,
      store,
      createMemoryTransport(),
      staff,
      {
        requestId,
        releasedOn: d('2027-07-09'),
        method: 'paper',
        items: [{ documentId: record.documentId, approvalId: record.approvalId }],
      },
      signal,
      NOW,
    )
    expect(released.ok).toBe(true)
    const row = await rowOf(requestId)
    expect(row?.status).toBe('responded')
    expect(row?.firstResponseKind).toBe('made_available')
    expect(row?.firstResponseOn).toBe('2027-07-05')
    expect(row?.acknowledgedOn).toBe('2027-07-05')
    expect(row?.followUpOn).toBe('2027-07-09')
  })

  it('a denial after the acknowledgement records with its withholding', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    await withheldInFull(requestId)
    const r = await respond({ requestId, kind: 'denied', respondedOn: d('2027-07-09') })
    expect(r.ok).toBe(true)
    const row = await rowOf(requestId)
    expect(row?.status).toBe('responded')
    expect(row?.firstResponseKind).toBe('denied')
    expect(row?.firstResponseOn).toBe('2027-07-05')
    expect(row?.followUpOn).toBe('2027-07-09')
  })

  it('a denial after an acknowledged time statement is dated from the statement', async () => {
    const requestId = await logged()
    await respond({ requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') })
    await respond({
      requestId,
      kind: 'time_statement',
      respondedOn: d('2027-07-09'),
      timeStatement: statement,
    })
    await withheldInFull(requestId)
    const deny = (deniedOn: string) =>
      denyRequest(
        { db: handle.db, store, actor: staff, signal, now: NOW },
        {
          requestId,
          deniedOn: d(deniedOn),
        },
      )
    expect(await deny('2027-07-07')).toEqual({ ok: false, error: 'before_statement' })
    expect((await rowOf(requestId))?.status).toBe('awaiting_decision')
    expect((await deny('2027-07-09')).ok).toBe(true)
    expect((await rowOf(requestId))?.deniedOn).toBe('2027-07-09')
  })

  it('a clarification with any other response is invalid', async () => {
    const requestId = await logged()
    const r = await respond({
      requestId,
      kind: 'website_reference',
      respondedOn: d('2027-07-05'),
      websiteUrl: 'https://town.example/records',
      clarification: 'Which years?',
    })
    expect(r).toEqual({ ok: false, error: 'invalid' })
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
