import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documentVersions, files, rtkLetterDeliveries, rtkReleases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { openRelease } from '@/features/rtk/releaseLinks'
import { MAX_ATTACHED_BYTES } from '@/features/rtk/releaseMail'
import { createRelease, type ReleaseInput } from '@/features/rtk/releases'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import {
  loggedRequest,
  type ReleasableRecord,
  RTK_TODAY,
  releasableRecord,
} from '@/test/rtkFixtures'

const signal = new AbortController().signal
const RELEASED_ON = '2026-11-04'
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let requestId: string
let record: ReleasableRecord
let mail: ReturnType<typeof createMemoryTransport>

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  mail = createMemoryTransport()
  requestId = await loggedRequest(handle.db, custodian)
  record = await releasableRecord(handle.db, store, custodian, requestId)
})
afterEach(async () => {
  await handle.drop()
})

const release = (extra: Partial<ReleaseInput> = {}) =>
  createRelease(
    handle.db,
    store,
    mail,
    custodian,
    {
      requestId,
      releasedOn: RELEASED_ON,
      method: 'email',
      items: [{ documentId: record.documentId, approvalId: record.approvalId }],
      recipientEmail: 'jordan@example.test',
      ...extra,
    },
    signal,
    RTK_TODAY,
  )

async function releasedFile() {
  const [row] = await handle.db
    .select({ sha256: files.sha256, storageKey: files.storageKey })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.id, record.versionId))
  if (row === undefined) throw new Error('file')
  const stream = await store.getStream(row.storageKey, signal)
  if (!stream.ok) throw new Error('bytes')
  return { sha256: row.sha256, bytes: Buffer.from(await new Response(stream.value).arrayBuffer()) }
}

describe('releasing records as an email attachment', () => {
  it('needs an address to send them to', async () => {
    expect(await release({ recipientEmail: undefined })).toEqual({
      ok: false,
      error: 'recipient_required',
    })
    expect(mail.sent).toHaveLength(0)
  })

  it('emails the released file and the release letter, with no link', async () => {
    const result = await release()
    expect(result).toMatchObject({ ok: true, value: { delivery: 'attached' } })
    const [sent] = mail.sent
    expect(sent?.to).toBe('jordan@example.test')
    expect(sent?.subject).toBe('Records for request RK-2026-0001')
    expect(sent?.text).not.toContain('/records/releases/')
    expect(sent?.attachments?.map((a) => a.filename)).toEqual([
      'letter.pdf',
      'RK-2026-0001-release-1.pdf',
    ])
    expect(sent?.attachments?.[0]?.content.equals((await releasedFile()).bytes)).toBe(true)
    const [row] = await handle.db.select().from(rtkReleases)
    expect(row).toMatchObject({ method: 'email', linkTokenHash: null, linkExpiresAt: null })
    expect(await handle.db.select().from(rtkLetterDeliveries)).toMatchObject([
      { outcome: 'emailed', sentTo: 'jordan@example.test' },
    ])
  })

  it('sends a link instead when the files are too large to attach, and says so', async () => {
    const { sha256 } = await releasedFile()
    await handle.db
      .update(files)
      .set({ sizeBytes: MAX_ATTACHED_BYTES + 1 })
      .where(eq(files.sha256, sha256))
    const result = await release()
    expect(result).toMatchObject({ ok: true, value: { delivery: 'link_fallback' } })
    const [sent] = mail.sent
    expect(sent?.text).toContain('too large to attach')
    expect(sent?.attachments?.map((a) => a.filename)).toEqual(['RK-2026-0001-release-1.pdf'])
    const token = /\/records\/releases\/([A-Za-z0-9_-]+)/.exec(sent?.text ?? '')?.[1] ?? ''
    expect((await openRelease(handle.db, token, RTK_TODAY, signal)).ok).toBe(true)
    const [row] = await handle.db.select().from(rtkReleases)
    expect(row?.method).toBe('email')
    expect(row?.linkExpiresAt).not.toBeNull()
  })

  it('releases nothing when the email cannot be sent', async () => {
    const failing = {
      send: () => Promise.resolve({ ok: false as const, error: 'send_failed' as const }),
    }
    const result = await createRelease(
      handle.db,
      store,
      failing,
      custodian,
      {
        requestId,
        releasedOn: RELEASED_ON,
        method: 'email',
        items: [{ documentId: record.documentId, approvalId: record.approvalId }],
        recipientEmail: 'jordan@example.test',
      },
      signal,
      RTK_TODAY,
    )
    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(await handle.db.select().from(rtkReleases)).toHaveLength(0)
  })
})
