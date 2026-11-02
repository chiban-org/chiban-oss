import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { redactionJobs } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { SWEEP_TARGETS } from '@/jobs/sweepTargets'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000)
let handle: TestDb
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

const target = (name: string) => {
  const found = SWEEP_TARGETS.find((t) => t.name === name)
  if (found === undefined) throw new Error(`no sweep target ${name}`)
  return found
}

describe('records sweep targets', () => {
  it('a redaction job queued more than 5 minutes ago is re-enqueued and a fresh one is not', async () => {
    const store = (await makeTestStore()).store
    const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    const base = {
      documentId: doc.documentId,
      sourceVersionId: doc.versionId,
      purpose: 'public' as const,
      createdBy: staff.userId,
    }
    const [fresh] = await handle.db
      .insert(redactionJobs)
      .values({ ...base, createdAt: minutesAgo(1) })
      .returning({ id: redactionJobs.id })
    const [old] = await handle.db
      .insert(redactionJobs)
      .values({ ...base, createdAt: minutesAgo(6) })
      .returning({ id: redactionJobs.id })
    await handle.db
      .insert(redactionJobs)
      .values({ ...base, status: 'complete', createdAt: minutesAgo(60) })
    const items = await target(JOB_NAMES.REDACTION_RUN).findOverdue(handle.db, NOW, signal)
    expect(items.map((i) => i.payload)).toEqual([{ jobId: old?.id }])
    expect(fresh?.id).not.toBe(old?.id)
  })
})
