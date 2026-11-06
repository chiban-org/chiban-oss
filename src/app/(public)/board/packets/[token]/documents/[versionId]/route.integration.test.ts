import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { setAudiences } from '@/features/documents/publish'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { packetMeeting } from '@/test/packetFixtures'
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

const { GET } = await import('@/app/(public)/board/packets/[token]/documents/[versionId]/route')

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  store = (await makeTestStore()).store
  state.store = store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

describe('board packet document route', () => {
  it('answers 410 with the withdrawal date once the approved version is revoked', async () => {
    const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    await setAudiences(handle.db, staff, { documentId: doc.documentId, audiences: [] }, signal)
    const redacted = await redactedVersionOf(handle.db, store, staff, doc)
    const approved = await approveRendition(
      handle.db,
      staff,
      { versionId: redacted, purpose: 'public', reviewStatement: STATEMENT },
      signal,
      store,
    )
    if (!approved.ok) throw new Error('approve')
    const made = await createPacket(
      handle.db,
      staff,
      {
        title: 'Packet',
        meetingId: await packetMeeting(handle.db, 'zba', '2027-04-01'),
        documentIds: [doc.documentId],
      },
      signal,
    )
    if (!made.ok) throw new Error('packet')
    const mail = createMemoryTransport()
    await sendPacketLink(
      handle.db,
      mail,
      staff,
      { packetId: made.value.packetId, recipientName: 'Board', recipientEmail: 'b@example.test' },
      signal,
    )
    const token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const call = () =>
      GET(new Request('https://alderpond.example/x'), {
        params: Promise.resolve({ token, versionId: redacted }),
      })
    expect((await call()).status).toBe(200)
    await revokeApproval(
      handle.db,
      staff,
      { approvalId: approved.value.approvalId, reason: 'The redaction missed a name' },
      signal,
      store,
    )
    const res = await call()
    expect(res.status).toBe(410)
    expect(await res.text()).toMatch(
      /^This document was withdrawn by the town on [A-Z][a-z]+ \d{1,2}, \d{4}\.$/,
    )
  })
})
