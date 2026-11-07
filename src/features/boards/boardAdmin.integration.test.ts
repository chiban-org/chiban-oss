import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, boardPackets, boards } from '@/db/schema'
import { archiveBoard, createBoard, renameBoard } from '@/features/boards/boardAdmin'
import { cancelMeeting, scheduleMeeting } from '@/features/boards/meetings'
import { activeBoards } from '@/features/boards/townBoards'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdOf,
  setupBoardWorld,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = BOARD_FIXTURE_NOW
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { pbMeetings: [], zbaMeetings: [] })
})
afterEach(async () => {
  await handle.drop()
})

async function addConservation() {
  const made = await createBoard(
    handle.db,
    world.admin,
    {
      name: 'Alder Pond Conservation Commission',
      shortName: 'Conservation Commission',
      kind: 'conservation_commission',
    },
    signal,
  )
  if (!made.ok) throw new Error(`create failed: ${JSON.stringify(made.error)}`)
  return made.value.boardId
}

describe('createBoard', () => {
  it('adds a board of a non-unique kind and audits it', async () => {
    const id = await addConservation()
    const [row] = await handle.db.select().from(boards).where(eq(boards.id, id))
    expect(row).toMatchObject({
      kind: 'conservation_commission',
      name: 'Alder Pond Conservation Commission',
      shortName: 'Conservation Commission',
      archivedAt: null,
      createdBy: world.admin.userId,
    })
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'board.create'), eq(auditLog.entityId, id)))
    expect(audit?.after).toMatchObject({ kind: 'conservation_commission' })
  })

  it('allows two boards of the same non-unique kind', async () => {
    await addConservation()
    const second = await createBoard(
      handle.db,
      world.admin,
      {
        name: 'North Conservation Commission',
        shortName: 'North Conservation',
        kind: 'conservation_commission',
      },
      signal,
    )
    expect(second.ok).toBe(true)
  })

  it('refuses a second active Planning Board', async () => {
    const made = await createBoard(
      handle.db,
      world.admin,
      { name: 'Another Planning Board', shortName: 'Planning Board', kind: 'planning_board' },
      signal,
    )
    expect(made).toEqual({ ok: false, error: 'kind_taken' })
  })

  it('refuses a name an active board already uses, ignoring case', async () => {
    await addConservation()
    const made = await createBoard(
      handle.db,
      world.admin,
      {
        name: 'alder pond conservation commission',
        shortName: 'CC',
        kind: 'conservation_commission',
      },
      signal,
    )
    expect(made).toEqual({ ok: false, error: 'name_taken' })
  })

  it('needs config.edit', async () => {
    const made = await createBoard(
      handle.db,
      world.staff,
      { name: 'X Commission', shortName: 'X', kind: 'other' },
      signal,
    )
    expect(made).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('renameBoard', () => {
  it('changes the name and short name and audits the change', async () => {
    const id = await addConservation()
    const renamed = await renameBoard(
      handle.db,
      world.admin,
      { boardId: id, name: 'Alder Pond Conservation Board', shortName: 'Conservation Board' },
      signal,
    )
    expect(renamed.ok).toBe(true)
    const [row] = await handle.db.select().from(boards).where(eq(boards.id, id))
    expect(row).toMatchObject({
      name: 'Alder Pond Conservation Board',
      shortName: 'Conservation Board',
    })
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'board.rename'), eq(auditLog.entityId, id)))
    expect(audit?.before).toMatchObject({ name: 'Alder Pond Conservation Commission' })
    expect(audit?.after).toMatchObject({ name: 'Alder Pond Conservation Board' })
  })

  it('needs config.edit and refuses an unknown board', async () => {
    const id = await addConservation()
    const input = { boardId: id, name: 'New', shortName: 'New' }
    expect(await renameBoard(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(
      await renameBoard(
        handle.db,
        world.admin,
        { ...input, boardId: '00000000-0000-4000-8000-000000000000' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('archiveBoard', () => {
  it('refuses while a scheduled meeting is ahead, then archives once it is cancelled', async () => {
    const id = await addConservation()
    const meeting = await scheduleMeeting(
      handle.db,
      world.staff,
      { boardId: id, meetingDate: '2028-02-10' as CivilDate, kind: 'regular' },
      signal,
    )
    if (!meeting.ok) throw new Error('schedule failed')
    const refused = await archiveBoard(handle.db, world.admin, { boardId: id }, signal, NOW)
    expect(refused).toEqual({
      ok: false,
      error: { blocked: ['It has 1 scheduled meeting ahead. Cancel it first.'] },
    })
    await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: meeting.value.meetingId, reason: 'No quorum' },
      signal,
      NOW,
    )
    const archived = await archiveBoard(handle.db, world.admin, { boardId: id }, signal, NOW)
    expect(archived.ok).toBe(true)
    const [row] = await handle.db.select().from(boards).where(eq(boards.id, id))
    expect(row?.archivedAt).not.toBeNull()
    expect((await activeBoards(handle.db)).map((b) => b.id)).not.toContain(id)
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'board.archive'), eq(auditLog.entityId, id)))
    expect(audit).toBeDefined()
  })

  it('does not count a past meeting, and archived boards cannot be scheduled or renamed', async () => {
    const id = await addConservation()
    const past = await scheduleMeeting(
      handle.db,
      world.staff,
      { boardId: id, meetingDate: '2027-12-01' as CivilDate, kind: 'regular' },
      signal,
    )
    expect(past.ok).toBe(true)
    expect((await archiveBoard(handle.db, world.admin, { boardId: id }, signal, NOW)).ok).toBe(true)
    expect(
      await scheduleMeeting(
        handle.db,
        world.staff,
        { boardId: id, meetingDate: '2028-03-01' as CivilDate, kind: 'regular' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_board' })
    expect(
      await renameBoard(handle.db, world.admin, { boardId: id, name: 'Z', shortName: 'Z' }, signal),
    ).toEqual({ ok: false, error: 'archived' })
    expect(await archiveBoard(handle.db, world.admin, { boardId: id }, signal, NOW)).toEqual({
      ok: false,
      error: 'already_archived',
    })
  })

  it('refuses while a packet is unsent', async () => {
    const id = await addConservation()
    await handle.db.insert(boardPackets).values({
      title: 'February packet',
      boardId: id,
      meetingDate: '2028-02-10',
      createdBy: world.staff.userId,
    })
    expect(await archiveBoard(handle.db, world.admin, { boardId: id }, signal, NOW)).toEqual({
      ok: false,
      error: { blocked: ['It has a packet that has not been sent or is still open.'] },
    })
  })

  it('refuses the Planning Board while an application of its kind is not closed', async () => {
    const { submitBoardApplication } = await import('@/test/boardFixtures')
    await submitBoardApplication(handle.db, world, world.pbTypeKey, '2028-01-03')
    const pb = await boardIdOf(handle.db, 'planning_board')
    expect(await archiveBoard(handle.db, world.admin, { boardId: pb }, signal, NOW)).toEqual({
      ok: false,
      error: { blocked: ['Planning Board applications still open: 1.'] },
    })
    const zba = await boardIdOf(handle.db, 'zba')
    expect((await archiveBoard(handle.db, world.admin, { boardId: zba }, signal, NOW)).ok).toBe(
      true,
    )
  })

  it('needs config.edit', async () => {
    const id = await addConservation()
    expect(await archiveBoard(handle.db, world.staff, { boardId: id }, signal, NOW)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
