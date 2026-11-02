import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  anonymousIntakeProbeTokens,
  anonymousIntakeVerifications,
  complaints,
  documents,
  documentText,
  documentVersions,
  enforcementCases,
  files,
  preservationRecords,
  townSettings,
} from '@/db/schema'
import { handleAnonymousIntake } from '@/features/anonymousIntake/handler'
import { purgeProbes } from '@/features/anonymousIntake/purgeProbe'
import { issueProbeToken } from '@/features/anonymousIntake/staffControl'
import type { ObjectStore } from '@/features/storage/objectStore'
import { createRateLimiter } from '@/server/rateLimiter'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const ORIGIN = new URL(env.BASE_URL).origin
let handle: TestDb
let store: ObjectStore

const photo = readFileSync(
  fileURLToPath(new URL('../../test/fixtures/anonymous/gps-artist.jpg', import.meta.url)),
)

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  await openAnonymousIntake(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function submit(headers: Record<string, string> = {}, withPhoto = true) {
  const form = new FormData()
  form.append('location', '14 Birch Lane')
  form.append('description', 'A shed with no permit')
  if (withPhoto)
    form.append('photos', new File([new Uint8Array(photo)], 'a.jpg', { type: 'image/jpeg' }))
  return await handleAnonymousIntake(
    {
      db: handle.db,
      store,
      now: () => NOW,
      limiter: createRateLimiter({ max: 50, windowMs: 1000 }),
      imageRef: null,
      appVersion: '0.0.0',
    },
    new Request(`${ORIGIN}/intake/anonymous`, { method: 'POST', body: form, headers }),
    signal,
  )
}

async function realAndProbeVersions() {
  const token = await issueProbeToken(handle.db, NOW)
  await submit({ 'x-chiban-probe': token })
  await submit()
  const rows = await handle.db
    .select({ versionId: documentVersions.id, isProbe: complaints.isProbe })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .innerJoin(complaints, eq(complaints.caseId, documents.recordId))
  const real = rows.find((r) => !r.isProbe)
  const probe = rows.find((r) => r.isProbe)
  if (real === undefined || probe === undefined) throw new Error('fixture missing')
  return { realId: real.versionId, probeId: probe.versionId }
}

async function deleteWithPurgeSetting(versionId: string) {
  await handle.db.delete(documentText)
  await handle.db.delete(preservationRecords)
  return await handle.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('chiban.probe_purge', 'on', true)`)
    return await tx.delete(documentVersions).where(eq(documentVersions.id, versionId))
  })
}

describe('document version delete guard', () => {
  it('a session with the purge setting on cannot delete a normal document version', async () => {
    const { realId } = await realAndProbeVersions()
    await expectDbError(deleteWithPurgeSetting(realId), /insert-only/)
    expect(
      await handle.db.select().from(documentVersions).where(eq(documentVersions.id, realId)),
    ).toHaveLength(1)
  })

  it('a session without the purge setting cannot delete a probe version', async () => {
    const { probeId } = await realAndProbeVersions()
    await expectDbError(
      handle.db.delete(documentVersions).where(eq(documentVersions.id, probeId)),
      /insert-only/,
    )
  })

  it('the purge setting deletes a version of a probe document', async () => {
    const { probeId } = await realAndProbeVersions()
    await deleteWithPurgeSetting(probeId)
    expect(
      await handle.db.select().from(documentVersions).where(eq(documentVersions.id, probeId)),
    ).toHaveLength(0)
  })

  it('an update is still rejected with the purge setting on', async () => {
    const { probeId } = await realAndProbeVersions()
    await expectDbError(
      handle.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('chiban.probe_purge', 'on', true)`)
        await tx
          .update(documentVersions)
          .set({ role: 'pdfa' })
          .where(eq(documentVersions.id, probeId))
      }),
      /insert-only/,
    )
  })
})
