import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { setActivePackForTest } from '@/features/packs/registry'
import { createRelease } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
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
  setActivePackForTest(ACKNOWLEDGING_PACK)
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function acknowledged(): Promise<string> {
  const logged = await logRequest(
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
  if (!logged.ok) throw new Error(`log failed ${logged.error}`)
  const requestId = logged.value.requestId
  const ack = await recordFirstResponse(
    handle.db,
    store,
    staff,
    { requestId, kind: 'acknowledged', respondedOn: d('2027-07-05') },
    signal,
    NOW,
  )
  if (!ack.ok) throw new Error(`acknowledge failed ${ack.error}`)
  return requestId
}

async function releaseOn(requestId: string, on: string) {
  const record = await releasableRecord(handle.db, store, staff, requestId)
  return await createRelease(
    handle.db,
    store,
    createMemoryTransport(),
    staff,
    {
      requestId,
      releasedOn: d(on),
      method: 'paper',
      items: [{ documentId: record.documentId, approvalId: record.approvalId }],
    },
    signal,
    NOW,
  )
}

describe('a release after an acknowledgement', () => {
  it('is refused when dated before the acknowledgement and accepted the same day', async () => {
    const requestId = await acknowledged()
    expect(await releaseOn(requestId, '2027-07-04')).toEqual({
      ok: false,
      error: 'before_acknowledged',
    })
    const [row] = await handle.db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId))
    expect(row?.firstResponseKind).toBe('acknowledged')
    expect((await releaseOn(requestId, '2027-07-05')).ok).toBe(true)
  })
})
