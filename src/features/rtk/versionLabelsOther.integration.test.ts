import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { versionLabel } from '@/app/(staff)/staff/records/requests/[requestId]/versionLabels'
import type { Actor } from '@/features/auth/actor'
import { loadReleaseCandidates } from '@/features/rtk/requestPage'
import { logRequest } from '@/features/rtk/requests'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf } from '@/test/renditionFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const ZONE = 'America/New_York'
let handle: TestDb
let store: ObjectStore
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
})

async function logged(description: string): Promise<{ requestId: string; number: string }> {
  const r = await logRequest(
    handle.db,
    custodian,
    { receivedOn: '2027-07-02', receivedVia: 'email', description },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('the label of a copy redacted for another request', () => {
  it('names the request it was made for', async () => {
    const first = await logged('Owner letters on Birch Lane')
    const second = await logged('All Birch Lane correspondence')
    const doc = await uploadRedactionFixture(handle.db, store, custodian, 'letter.pdf')
    const redactedId = await redactedVersionOf(
      handle.db,
      store,
      custodian,
      doc,
      'rtk_release',
      first.requestId,
    )
    const [candidate] = await loadReleaseCandidates(handle.db, custodian, 'letter')
    const version = candidate?.versions.find((v) => v.id === redactedId)
    if (version === undefined) throw new Error('no redacted version found')
    expect(version.madeFor).toEqual({ requestId: first.requestId, number: first.number })
    const createdAt = new Date(version.createdAt)
    const forSecond = versionLabel(version.role, createdAt, ZONE, {
      madeFor: version.madeFor,
      currentRequestId: second.requestId,
    })
    expect(forSecond.startsWith(`Redacted copy made for ${first.number}, `)).toBe(true)
    const forFirst = versionLabel(version.role, createdAt, ZONE, {
      madeFor: version.madeFor,
      currentRequestId: first.requestId,
    })
    expect(forFirst.startsWith('Redacted copy for this request, ')).toBe(true)
    const original = candidate?.versions.find((v) => v.role === 'original')
    expect(original?.madeFor).toBeNull()
  })
})
