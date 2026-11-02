import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  boardPacketAccess,
  boardPacketItems,
  boardPacketLinks,
  documentVersions,
} from '@/db/schema'
import {
  listPacketAccess,
  openPacket,
  openPacketVersion,
  revokePacketLink,
  sendPacketLink,
} from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { setAudiences, setPublic } from '@/features/documents/publish'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import { addRedactedCopy } from '@/test/searchFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const MEETING = '2027-04-14' as CivilDate
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let mail: MemoryMailTransport
let appRef: { kind: 'application'; id: string }

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  mail = createMemoryTransport()
  appRef = { kind: 'application', id: (await makeApplication(handle.db, world)).applicationId }
})
afterEach(async () => {
  await handle.drop()
})

async function boardDocument(title = 'Site plan') {
  const up = await uploadAs(
    handle.db,
    store,
    world.applicant,
    appRef,
    pdfBytes(`board ${title} ${Math.random()}`),
    { title },
  )
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: up.documentId, audiences: ['board'] },
    signal,
  )
  return up
}

async function packetWith(documentIds: string[]) {
  const made = await createPacket(
    handle.db,
    world.staff,
    { title: 'April agenda', board: 'planning_board', meetingDate: MEETING, documentIds },
    signal,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  return made.value.packetId
}

async function link(packetId: string, expiresInDays?: number) {
  const sent = await sendPacketLink(
    handle.db,
    mail,
    world.staff,
    {
      packetId,
      recipientName: 'Bea Board',
      recipientEmail: 'bea@alderpond.example',
      ...(expiresInDays === undefined ? {} : { expiresInDays }),
    },
    signal,
  )
  if (!sent.ok) throw new Error(sent.error)
  const token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
  return { linkId: sent.value.linkId ?? '', token }
}

describe('board packets', () => {
  it('a document without the board audience or public flag is refused as notForBoard', async () => {
    const hidden = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      pdfBytes('private plan'),
      { title: 'Private plan' },
    )
    const made = await createPacket(
      handle.db,
      world.staff,
      { title: 'x', board: 'zba', meetingDate: MEETING, documentIds: [hidden.documentId] },
      signal,
    )
    expect(made).toEqual({ ok: false, error: { notForBoard: [hidden.documentId] } })
  })

  it('packet freezes the version: a later redacted upload does not change what the board receives', async () => {
    const doc = await boardDocument('Septic design')
    await setPublic(handle.db, world.staff, { documentId: doc.documentId, isPublic: true }, signal)
    const packetId = await packetWith([doc.documentId])
    const { token } = await link(packetId)
    await addRedactedCopy(handle.db, store, world.staff, appRef, doc.documentId, 'redacted later')
    const opened = await openPacket(handle.db, token, new Date(), signal)
    if (!opened.ok) throw new Error(opened.error)
    expect(opened.value.items).toHaveLength(1)
    expect(opened.value.items[0]?.versionId).toBe(doc.versionId)
    const roles = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc.documentId))
    expect(roles.map((r) => r.role).sort()).toEqual(['original', 'public_redacted'])
  })

  it('a public document with no board audience is frozen at its public rendition', async () => {
    const up = await uploadAs(handle.db, store, world.applicant, appRef, pdfBytes('public only'), {
      title: 'Public',
    })
    await setPublic(handle.db, world.staff, { documentId: up.documentId, isPublic: true }, signal)
    await addRedactedCopy(handle.db, store, world.staff, appRef, up.documentId, 'public copy')
    const packetId = await packetWith([up.documentId])
    const [item] = await handle.db
      .select()
      .from(boardPacketItems)
      .where(eq(boardPacketItems.packetId, packetId))
    const [version] = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, item?.versionId ?? ''))
    expect(version?.role).toBe('public_redacted')
  })

  it('link opens before expiry, expired link returns expired, revoked link returns invalid', async () => {
    const doc = await boardDocument()
    const packetId = await packetWith([doc.documentId])
    const { token, linkId } = await link(packetId)
    const now = new Date()
    expect((await openPacket(handle.db, token, now, signal)).ok).toBe(true)
    const later = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
    expect(await openPacket(handle.db, token, later, signal)).toEqual({
      ok: false,
      error: 'expired',
    })
    expect(await openPacket(handle.db, 'nope', now, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect((await revokePacketLink(handle.db, world.staff, { linkId }, signal)).ok).toBe(true)
    expect(await openPacket(handle.db, token, now, signal)).toEqual({ ok: false, error: 'invalid' })
  })

  it('a version not in the packet is not found through the packet token, and each download is logged', async () => {
    const doc = await boardDocument()
    const other = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      pdfBytes('not in packet'),
      { title: 'Other' },
    )
    const packetId = await packetWith([doc.documentId])
    const { token } = await link(packetId)
    const now = new Date()
    const ok = await openPacketVersion(handle.db, store, token, doc.versionId, now, signal)
    expect(ok.ok).toBe(true)
    expect(await openPacketVersion(handle.db, store, token, other.versionId, now, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    const log = await listPacketAccess(handle.db, packetId)
    expect(log.map((l) => l.versionId)).toEqual([doc.versionId])
    expect((await handle.db.select().from(boardPacketAccess)).length).toBe(1)
  })

  it('expiry of 31 days is expiry_too_long and the default is 14 days', async () => {
    const packetId = await packetWith([(await boardDocument()).documentId])
    expect(
      await sendPacketLink(
        handle.db,
        mail,
        world.staff,
        { packetId, recipientName: 'B', recipientEmail: 'b@alderpond.example', expiresInDays: 31 },
        signal,
      ),
    ).toEqual({ ok: false, error: 'expiry_too_long' })
    await link(packetId)
    const [row] = await handle.db.select().from(boardPacketLinks)
    const days =
      ((row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0)) / (24 * 60 * 60 * 1000)
    expect(Math.round(days)).toBe(14)
  })

  it('staff without packet.manage is forbidden', async () => {
    const doc = await boardDocument()
    const inspector = await staffActor(handle.db, 'inspector')
    expect(
      await createPacket(
        handle.db,
        inspector,
        { title: 'x', board: 'zba', meetingDate: MEETING, documentIds: [doc.documentId] },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    const packetId = await packetWith([doc.documentId])
    expect(
      await sendPacketLink(
        handle.db,
        mail,
        inspector,
        { packetId, recipientName: 'B', recipientEmail: 'b@alderpond.example' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('token is stored hashed and the email has the subject and link', async () => {
    const packetId = await packetWith([(await boardDocument()).documentId])
    const { token } = await link(packetId)
    const [row] = await handle.db.select().from(boardPacketLinks)
    expect(row?.tokenHash).toBe(createHash('sha256').update(token).digest('base64url'))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(mail.sent[0]?.subject).toBe('Board packet: April agenda, meeting April 14, 2027')
    expect(mail.sent[0]?.text).toContain(`${env.BASE_URL}/board/packets/${token}`)
  })
})
