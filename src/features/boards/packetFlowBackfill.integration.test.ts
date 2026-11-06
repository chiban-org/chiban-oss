import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditLog,
  boardPacketAccess,
  boardPacketItems,
  boardPacketLinks,
  boardPacketMembers,
  boardPackets,
  users,
} from '@/db/schema'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'

const MIGRATION = new URL('../../../drizzle/0088_packet_flow.sql', import.meta.url)
const BY = randomUUID()
const CREATED = new Date('2027-03-01T15:00:00Z')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

async function backfill(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(
      (s) => /^(UPDATE|INSERT)/.test(s) || s.includes('TRIGGER board_packet_access_immutable'),
    )
  for (const statement of statements) await handle.db.execute(sql.raw(statement))
}

async function legacyPacket() {
  const world = await setupPermitWorld(handle.db)
  const { store } = await makeTestStore()
  const app = await makeApplication(handle.db, world)
  const up = await uploadAs(
    handle.db,
    store,
    world.applicant,
    { kind: 'application', id: app.applicationId },
    pdfBytes(`legacy ${Math.random()}`),
    { title: 'Site plan' },
  )
  const [packet] = await handle.db
    .insert(boardPackets)
    .values({
      title: 'Legacy',
      board: 'zba',
      meetingDate: '2027-03-18',
      createdBy: BY,
      createdAt: CREATED,
    })
    .returning({ id: boardPackets.id })
  const packetId = packet?.id ?? ''
  await handle.db.insert(boardPacketItems).values({
    packetId,
    documentId: up.documentId,
    versionId: up.versionId,
    position: 0,
  })
  const [link] = await handle.db
    .insert(boardPacketLinks)
    .values({
      packetId,
      recipientName: 'Counsel',
      recipientEmail: 'counsel@alderpond.example',
      tokenHash: randomUUID(),
      expiresAt: new Date('2027-04-01T00:00:00Z'),
      createdBy: BY,
    })
    .returning({ id: boardPacketLinks.id })
  const [member] = await handle.db
    .insert(users)
    .values({ email: 'seated@alderpond.example', displayName: 'Seated', kind: 'public' })
    .returning({ id: users.id })
  await handle.db.insert(boardPacketAccess).values([
    { linkId: link?.id ?? '', versionId: null },
    { userId: member?.id ?? '', versionId: up.versionId },
  ])
  await handle.db.insert(auditLog).values({
    actorKind: 'user',
    action: 'packet.member.notify',
    entityType: 'board_packet',
    entityId: packetId,
    after: { recipientName: 'Seated', recipientEmail: 'Seated@alderpond.example' },
    at: new Date('2027-03-02T15:00:00Z'),
  })
  return { packetId, userId: member?.id ?? '' }
}

describe('existing packets after the packet flow migration', () => {
  it('count as sent when made, keep their reads, and keep the members they were sent to', async () => {
    const { packetId, userId } = await legacyPacket()
    await backfill()
    const [packet] = await handle.db
      .select()
      .from(boardPackets)
      .where(eq(boardPackets.id, packetId))
    expect(packet?.sentAt).toEqual(CREATED)
    expect(packet?.lastSentAt).toEqual(CREATED)
    const items = await handle.db.select().from(boardPacketItems)
    expect(items.map((i) => i.sentAt)).toEqual([CREATED])
    const reads = await handle.db.select().from(boardPacketAccess)
    expect(reads.map((r) => r.packetId)).toEqual([packetId, packetId])
    expect(await handle.db.select().from(boardPacketMembers)).toEqual([
      {
        packetId,
        userId,
        sentAt: new Date('2027-03-02T15:00:00Z'),
        lastSentAt: new Date('2027-03-02T15:00:00Z'),
      },
    ])
  })
})
