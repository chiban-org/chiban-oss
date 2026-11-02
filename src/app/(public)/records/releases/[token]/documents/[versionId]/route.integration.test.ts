import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown; store: unknown } => ({ db: null, store: null }))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/features/storage/objectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))

const { GET } = await import('@/app/(public)/records/releases/[token]/documents/[versionId]/route')

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let store: ObjectStore
let custodian: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  store = (await makeTestStore()).store
  state.store = store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterAll(async () => {
  await handle.drop()
})

describe('release document route', () => {
  it('streams while the version is released, then answers 410 once revoked, 404 for strangers', async () => {
    const logged = await logRequest(
      handle.db,
      custodian,
      { receivedOn: d('2026-10-30'), receivedVia: 'email', description: 'Owner letters' },
      signal,
    )
    if (!logged.ok) throw new Error('log')
    const doc = await uploadRedactionFixture(
      handle.db,
      store,
      custodian,
      'letter.pdf',
      undefined,
      false,
    )
    const redacted = await redactedVersionOf(
      handle.db,
      store,
      custodian,
      doc,
      'rtk_release',
      logged.value.requestId,
    )
    const approved = await approveRendition(
      handle.db,
      custodian,
      {
        versionId: redacted,
        purpose: 'rtk_release',
        rtkRequestId: logged.value.requestId,
        reviewStatement: STATEMENT,
      },
      signal,
      store,
    )
    if (!approved.ok) throw new Error('approve')
    const mail = createMemoryTransport()
    const released = await createRelease(
      handle.db,
      store,
      mail,
      custodian,
      {
        requestId: logged.value.requestId,
        releasedOn: d('2026-11-02'),
        method: 'electronic_link',
        recipientEmail: 'jordan@example.test',
        items: [{ documentId: doc.documentId, approvalId: approved.value.approvalId }],
      },
      signal,
      new Date(),
    )
    if (!released.ok) throw new Error(`release ${released.error}`)
    const token =
      /\/records\/releases\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const call = (t: string, v: string) =>
      GET(new Request('https://alderpond.example/x'), {
        params: Promise.resolve({ token: t, versionId: v }),
      })
    const ok = await call(token, redacted)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect((await call('unknown-token', redacted)).status).toBe(404)
    expect((await call(token, doc.versionId)).status).toBe(404)
    expect((await call(token, 'not-a-uuid')).status).toBe(404)
    await revokeApproval(
      handle.db,
      custodian,
      { approvalId: approved.value.approvalId, reason: 'The redaction missed a name' },
      signal,
      store,
    )
    const gone = await call(token, redacted)
    expect(gone.status).toBe(410)
    expect(await gone.text()).toMatch(/^This document was withdrawn by the town on /)
  })
})
