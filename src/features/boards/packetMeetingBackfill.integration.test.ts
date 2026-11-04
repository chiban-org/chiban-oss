import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { asc, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boardMeetings, boardPackets } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/test/db'

const MIGRATION = new URL('../../../drizzle/0085_packet_meeting.sql', import.meta.url)
const BY = randomUUID()

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
    .filter((s) => s.startsWith('WITH'))
  for (const statement of statements) await handle.db.execute(sql.raw(statement))
}

async function meeting(
  board: 'planning_board' | 'zba',
  meetingDate: string,
  extra: { kind?: 'regular' | 'special'; status?: 'scheduled' | 'cancelled' } = {},
): Promise<string> {
  const [row] = await handle.db
    .insert(boardMeetings)
    .values({
      board,
      meetingDate,
      kind: extra.kind ?? 'regular',
      status: extra.status,
      createdBy: BY,
    })
    .returning({ id: boardMeetings.id })
  return row?.id ?? ''
}

let created = 0

async function packet(title: string, board: 'planning_board' | 'zba', meetingDate: string) {
  created += 1
  await handle.db.insert(boardPackets).values({
    title,
    board,
    meetingDate,
    createdBy: BY,
    createdAt: new Date(Date.UTC(2027, 0, 1, created)),
  })
}

describe('linking existing packets to their meeting', () => {
  it('links a packet whose board and date match one scheduled meeting and leaves the rest', async () => {
    const april = await meeting('planning_board', '2027-04-14')
    await meeting('zba', '2027-04-15', { status: 'cancelled' })
    await meeting('zba', '2027-05-20')
    await meeting('zba', '2027-05-20', { kind: 'special' })
    const june = await meeting('planning_board', '2027-06-09')
    await packet('April', 'planning_board', '2027-04-14')
    await packet('Cancelled', 'zba', '2027-04-15')
    await packet('Two meetings', 'zba', '2027-05-20')
    await packet('No meeting', 'planning_board', '2027-07-14')
    await packet('June', 'planning_board', '2027-06-09')
    await packet('June again', 'planning_board', '2027-06-09')
    await backfill()
    const rows = await handle.db
      .select({ title: boardPackets.title, meetingId: boardPackets.meetingId })
      .from(boardPackets)
      .orderBy(asc(boardPackets.title))
    expect(rows).toEqual([
      { title: 'April', meetingId: april },
      { title: 'Cancelled', meetingId: null },
      { title: 'June', meetingId: null },
      { title: 'June again', meetingId: june },
      { title: 'No meeting', meetingId: null },
      { title: 'Two meetings', meetingId: null },
    ])
  })
})
