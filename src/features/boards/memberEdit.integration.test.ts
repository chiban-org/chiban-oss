import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, boardMemberships, users } from '@/db/schema'
import { updateBoardMember } from '@/features/boards/memberEdit'
import { inviteBoardMember } from '@/features/boards/members'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { type BoardWorld, boardIdOf, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let robin: string
let robinUser: string
let zbaId = ''
let planningId = ''

async function invite(name: string): Promise<{ membershipId: string; userId: string }> {
  const made = await inviteBoardMember(
    handle.db,
    createMemoryTransport(),
    world.staff,
    {
      email: `${name.toLowerCase()}@alderpond.example`,
      displayName: name,
      boardId: await boardIdOf(handle.db, 'planning_board'),
      title: 'member',
      termStart: d('2026-01-01'),
    },
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value
}

const change = (fields: Partial<Parameters<typeof updateBoardMember>[2]> = {}) => ({
  membershipId: robin,
  displayName: 'Robin Alder',
  email: 'robin.alder@alderpond.example',
  boardId: zbaId,
  title: 'chair' as const,
  termStart: d('2026-02-01'),
  termEnd: d('2029-01-31'),
  ...fields,
})

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  zbaId = await boardIdOf(handle.db, 'zba')
  planningId = await boardIdOf(handle.db, 'planning_board')
  const made = await invite('Robin')
  robin = made.membershipId
  robinUser = made.userId
  await invite('Casey')
})
afterAll(async () => {
  await handle.drop()
})

describe('editing a board member', () => {
  it('saves the name, email, board, role and term, and records the change', async () => {
    expect(await updateBoardMember(handle.db, world.staff, change(), signal)).toEqual({
      ok: true,
      value: undefined,
    })
    const [user] = await handle.db.select().from(users).where(eq(users.id, robinUser))
    expect(user).toMatchObject({
      displayName: 'Robin Alder',
      email: 'robin.alder@alderpond.example',
    })
    const [seat] = await handle.db
      .select()
      .from(boardMemberships)
      .where(eq(boardMemberships.id, robin))
    expect(seat).toMatchObject({
      boardId: zbaId,
      title: 'chair',
      termStart: '2026-02-01',
      termEnd: '2029-01-31',
    })
    const [entry] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'board.member.update'), eq(auditLog.entityId, robinUser)))
    expect(entry?.before).toMatchObject({
      displayName: 'Robin',
      email: 'robin@alderpond.example',
      boardId: planningId,
      title: 'member',
      termEnd: null,
    })
    expect(entry?.after).toMatchObject({
      displayName: 'Robin Alder',
      boardId: zbaId,
      title: 'chair',
    })
  })

  it('refuses someone who cannot manage members', async () => {
    expect(await updateBoardMember(handle.db, world.reviewer, change(), signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('refuses a term that ends before it starts', async () => {
    expect(
      await updateBoardMember(handle.db, world.staff, change({ termEnd: d('2025-12-31') }), signal),
    ).toEqual({ ok: false, error: 'term_order' })
  })

  it('refuses an email another member already uses', async () => {
    expect(
      await updateBoardMember(
        handle.db,
        world.staff,
        change({ email: 'Casey@alderpond.example' }),
        signal,
      ),
    ).toEqual({ ok: false, error: 'email_taken' })
  })

  it('refuses an email that belongs to a staff account', async () => {
    const [staff] = await handle.db.select().from(users).where(eq(users.id, world.staff.userId))
    expect(
      await updateBoardMember(
        handle.db,
        world.staff,
        change({ email: staff?.email ?? '' }),
        signal,
      ),
    ).toEqual({ ok: false, error: 'staff_account' })
  })

  it('refuses a blank name and an unknown membership', async () => {
    expect(
      await updateBoardMember(handle.db, world.staff, change({ displayName: ' ' }), signal),
    ).toEqual({ ok: false, error: 'name_required' })
    expect(
      await updateBoardMember(
        handle.db,
        world.staff,
        change({ membershipId: '00000000-0000-4000-8000-000000000000' }),
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
  })
})
