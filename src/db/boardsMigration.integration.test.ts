import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { applyMigrations } from '@/db/migrate'
import { makeEmptyDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const opened: TestDb[] = []
const ACTOR = '00000000-0000-4000-8000-000000000001'
const LAST_OLD_INDEX = 93

afterAll(async () => {
  await Promise.all(opened.map((h) => h.drop()))
})

async function foldersUpTo(index: number): Promise<string> {
  const target = await mkdtemp(path.join(tmpdir(), 'migrations-'))
  await cp(path.resolve(process.cwd(), 'drizzle'), target, { recursive: true })
  const journalPath = path.join(target, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: { idx: number }[]
  }
  journal.entries = journal.entries.filter((e) => e.idx <= index)
  await writeFile(journalPath, JSON.stringify(journal))
  return target
}

interface Seeded {
  handle: TestDb
  meetingId: string
  packetId: string
  membershipId: string
}

async function seedBefore(publishedLabels: boolean): Promise<Seeded> {
  const handle = await makeEmptyDb()
  opened.push(handle)
  const old = await applyMigrations(handle.db, signal, await foldersUpTo(LAST_OLD_INDEX))
  expect(old.ok).toBe(true)
  const q = async (text: ReturnType<typeof sql>) => (await handle.db.execute(text)).rows
  const [pbMeeting] = (await q(
    sql`insert into board_meetings (board, meeting_date, kind, created_by)
      values ('planning_board', '2027-03-10', 'regular', ${ACTOR}) returning id`,
  )) as { id: string }[]
  await q(
    sql`insert into board_meetings (board, meeting_date, kind, created_by)
      values ('zba', '2027-03-11', 'regular', ${ACTOR})`,
  )
  const [packet] = (await q(
    sql`insert into board_packets (title, board, meeting_date, meeting_id, created_by)
      values ('March packet', 'zba', '2027-03-11', null, ${ACTOR}) returning id`,
  )) as { id: string }[]
  const [membership] = (await q(
    sql`insert into board_memberships (user_id, board, title, term_start, created_by)
      values (${ACTOR}, 'zba', 'chair', '2026-01-01', ${ACTOR}) returning id`,
  )) as { id: string }[]
  const boardEntry = (board: string, label: string, filingLeadDays: number | null) => ({
    board,
    label,
    publicNotice: {
      posting: true,
      publication: false,
      newspaper: null,
      bulletinBoards: [],
      websiteUrl: null,
    },
    filingLeadDays,
    filingLeadAdoption: null,
  })
  const settings = (pb: string, zba: string) => ({
    key: 'default',
    boards: [boardEntry('planning_board', pb, 14), boardEntry('zba', zba, null)],
    abutters: { projectionEnabled: false, assumedRightOfWayFt: 50 },
  })
  const insertConfig = async (
    kind: string,
    version: number,
    status: string,
    body: unknown,
  ): Promise<void> => {
    await q(
      sql`insert into config_versions (kind, key, version, status, body, created_by)
        values (${kind}, 'default', ${version}, ${status}, ${JSON.stringify(body)}::jsonb, ${ACTOR})`,
    )
  }
  if (publishedLabels) {
    await insertConfig('board_settings', 1, 'superseded', settings('Old PB', 'Old ZBA'))
    await insertConfig(
      'board_settings',
      2,
      'published',
      settings('Pine River Planning Board', 'Pine River ZBA'),
    )
    await insertConfig('board_settings', 3, 'draft', settings('Draft PB', 'Draft ZBA'))
  }
  const profile = (overrides: unknown) => ({
    key: 'default',
    officeName: 'Office',
    boardOverrides: overrides,
  })
  await insertConfig(
    'town_profile',
    1,
    'superseded',
    profile({ zba: { officeName: 'Zoning Office' } }),
  )
  await insertConfig(
    'town_profile',
    2,
    'published',
    profile({
      planning_board: { officeName: 'Planning Office' },
      zba: { footerText: 'ZBA footer' },
    }),
  )
  await insertConfig('town_profile', 3, 'draft', profile({}))
  return {
    handle,
    meetingId: pbMeeting?.id ?? '',
    packetId: packet?.id ?? '',
    membershipId: membership?.id ?? '',
  }
}

async function rows<T>(handle: TestDb, text: ReturnType<typeof sql>): Promise<T[]> {
  return (await handle.db.execute(text)).rows as T[]
}

describe('town boards migration', () => {
  it('creates one Planning Board and one ZBA row named from the published settings labels', async () => {
    const seeded = await seedBefore(true)
    const result = await applyMigrations(seeded.handle.db, signal)
    expect(result).toEqual({ ok: true, value: { applied: true } })
    const boards = await rows<{
      kind: string
      name: string
      short_name: string
      archived_at: null
    }>(seeded.handle, sql`select kind, name, short_name, archived_at from boards order by kind`)
    expect(boards).toEqual([
      {
        kind: 'planning_board',
        name: 'Pine River Planning Board',
        short_name: 'Planning Board',
        archived_at: null,
      },
      {
        kind: 'zba',
        name: 'Pine River ZBA',
        short_name: 'Zoning Board of Adjustment',
        archived_at: null,
      },
    ])
  })

  it('falls back to the default names when no board settings were ever published', async () => {
    const seeded = await seedBefore(false)
    await applyMigrations(seeded.handle.db, signal)
    const boards = await rows<{ kind: string; name: string }>(
      seeded.handle,
      sql`select kind, name from boards order by kind`,
    )
    expect(boards).toEqual([
      { kind: 'planning_board', name: 'Alder Pond Planning Board' },
      { kind: 'zba', name: 'Alder Pond Zoning Board of Adjustment' },
    ])
  })

  it('points meetings, packets and memberships at the board of their old literal', async () => {
    const seeded = await seedBefore(true)
    await applyMigrations(seeded.handle.db, signal)
    const meetings = await rows<{ id: string; kind: string }>(
      seeded.handle,
      sql`select m.id, b.kind from board_meetings m join boards b on b.id = m.board_id order by m.meeting_date`,
    )
    expect(meetings.map((m) => m.kind)).toEqual(['planning_board', 'zba'])
    expect(meetings[0]?.id).toBe(seeded.meetingId)
    const packet = await rows<{ kind: string }>(
      seeded.handle,
      sql`select b.kind from board_packets p join boards b on b.id = p.board_id where p.id = ${seeded.packetId}`,
    )
    expect(packet).toEqual([{ kind: 'zba' }])
    const membership = await rows<{ kind: string }>(
      seeded.handle,
      sql`select b.kind from board_memberships p join boards b on b.id = p.board_id where p.id = ${seeded.membershipId}`,
    )
    expect(membership).toEqual([{ kind: 'zba' }])
    const columns = await rows<{ column_name: string }>(
      seeded.handle,
      sql`select column_name from information_schema.columns
        where table_name in ('board_meetings', 'board_packets', 'board_memberships') and column_name = 'board'`,
    )
    expect(columns).toEqual([])
  })

  it('rewrites every board settings version from kind keys to board ids and drops the label', async () => {
    const seeded = await seedBefore(true)
    await applyMigrations(seeded.handle.db, signal)
    const ids = new Map(
      (
        await rows<{ id: string; kind: string }>(seeded.handle, sql`select id, kind from boards`)
      ).map((b) => [b.kind, b.id]),
    )
    const versions = await rows<{ version: number; body: { boards: Record<string, unknown>[] } }>(
      seeded.handle,
      sql`select version, body from config_versions where kind = 'board_settings' order by version`,
    )
    expect(versions).toHaveLength(3)
    for (const v of versions) {
      expect(v.body.boards.map((b) => b.boardId)).toEqual([
        ids.get('planning_board'),
        ids.get('zba'),
      ])
      for (const entry of v.body.boards) {
        expect(entry).not.toHaveProperty('board')
        expect(entry).not.toHaveProperty('label')
      }
      expect(v.body.boards[0]?.filingLeadDays).toBe(14)
    }
  })

  it('rewrites every town profile version so board overrides are keyed by board id', async () => {
    const seeded = await seedBefore(true)
    await applyMigrations(seeded.handle.db, signal)
    const ids = new Map(
      (
        await rows<{ id: string; kind: string }>(seeded.handle, sql`select id, kind from boards`)
      ).map((b) => [b.kind, b.id]),
    )
    const versions = await rows<{
      version: number
      body: { boardOverrides: Record<string, unknown> }
    }>(
      seeded.handle,
      sql`select version, body from config_versions where kind = 'town_profile' order by version`,
    )
    expect(versions.map((v) => v.body.boardOverrides)).toEqual([
      { [ids.get('zba') ?? '']: { officeName: 'Zoning Office' } },
      {
        [ids.get('planning_board') ?? '']: { officeName: 'Planning Office' },
        [ids.get('zba') ?? '']: { footerText: 'ZBA footer' },
      },
      {},
    ])
  })

  it('allows only one active Planning Board and one active ZBA', async () => {
    const seeded = await seedBefore(false)
    await applyMigrations(seeded.handle.db, signal)
    await expect(
      seeded.handle.db.execute(
        sql`insert into boards (kind, name, short_name) values ('zba', 'Second', 'Second')`,
      ),
    ).rejects.toThrow()
    await seeded.handle.db.execute(
      sql`insert into boards (kind, name, short_name) values ('conservation_commission', 'A', 'A')`,
    )
    await seeded.handle.db.execute(
      sql`insert into boards (kind, name, short_name) values ('conservation_commission', 'B', 'B')`,
    )
  })
})
