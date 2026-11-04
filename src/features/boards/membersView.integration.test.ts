import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { endMembership, inviteBoardMember } from '@/features/boards/members'
import { MEMBER_SORT } from '@/features/boards/membersParams'
import { loadMembersView } from '@/features/boards/membersView'
import { defaultSort } from '@/features/dataTable/sort'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-04-10'
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

async function invite(name: string, board: 'planning_board' | 'zba', termEnd?: string) {
  const made = await inviteBoardMember(
    handle.db,
    createMemoryTransport(),
    world.staff,
    {
      email: `${name.toLowerCase()}@alderpond.example`,
      displayName: name,
      board,
      title: 'member',
      termStart: '2020-01-01' as CivilDate,
      ...(termEnd === undefined ? {} : { termEnd: termEnd as CivilDate }),
    },
    signal,
  )
  if (!made.ok) throw new Error(made.error)
  return made.value.membershipId
}

function view(tab: 'active' | 'ended', sort = defaultSort(MEMBER_SORT), offset = 0, limit = 25) {
  return loadMembersView(handle.db, world.staff, { today: TODAY, tab, sort, limit, offset }, signal)
}

describe('board members list', () => {
  it('splits active and ended members into tabs with counts', async () => {
    const before = await view('active')
    await invite('Robin', 'planning_board')
    await invite('Casey', 'zba', '2021-12-31')
    const active = await view('active')
    const ended = await view('ended')
    expect(active?.rows.map((r) => r.name)).toContain('Robin')
    expect(active?.rows.map((r) => r.name)).not.toContain('Casey')
    expect(ended?.rows.map((r) => r.name)).toEqual(['Casey'])
    expect(ended?.rows[0]?.statusText).toBe('Ended December 31, 2021')
    expect(active?.counts.get('active')).toBe((before?.counts.get('active') ?? 0) + 1)
    expect(active?.counts.get('ended')).toBe(1)
    expect(active?.rows).toHaveLength(active?.counts.get('active') ?? -1)
  })

  it('pages a long list and counts the whole tab', async () => {
    for (const name of ['Ash', 'Birch', 'Cedar']) await invite(name, 'planning_board', '2021-01-31')
    const first = await view('ended', defaultSort(MEMBER_SORT), 0, 2)
    const second = await view('ended', defaultSort(MEMBER_SORT), 2, 2)
    expect(first?.rows).toHaveLength(2)
    expect(first).toMatchObject({ offset: 0, total: 3, prevOffset: null, nextOffset: 2 })
    expect(second?.rows).toHaveLength(1)
    expect(second).toMatchObject({ offset: 2, total: 3, prevOffset: 0, nextOffset: null })
  })

  it('sorts by name from the header in both directions', async () => {
    const names = (rows: { name: string }[] | undefined) => (rows ?? []).map((r) => r.name)
    const up = names((await view('active', { key: 'name', dir: 'asc' }))?.rows)
    expect(up).toEqual([...up].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())))
    const down = names((await view('active', { key: 'name', dir: 'desc' }))?.rows)
    expect(down).toEqual([...up].reverse())
  })

  it('refuses to end a membership that has already ended', async () => {
    const id = await invite('Casey', 'zba', '2021-12-31')
    expect(await endMembership(handle.db, world.staff, id, signal, NOW)).toEqual({
      ok: false,
      error: 'already_ended',
    })
  })

  it('refuses to end a term that has not started', async () => {
    const made = await inviteBoardMember(
      handle.db,
      createMemoryTransport(),
      world.staff,
      {
        email: 'later@alderpond.example',
        displayName: 'Later',
        board: 'zba',
        title: 'member',
        termStart: '2099-01-01' as CivilDate,
      },
      signal,
    )
    if (!made.ok) throw new Error(made.error)
    expect(
      await endMembership(handle.db, world.staff, made.value.membershipId, signal, NOW),
    ).toEqual({ ok: false, error: 'not_started' })
  })

  it('shows nothing to someone who cannot manage members', async () => {
    expect(
      await loadMembersView(
        handle.db,
        world.reviewer,
        { today: TODAY, tab: 'active', sort: defaultSort(MEMBER_SORT), limit: 25, offset: 0 },
        signal,
      ),
    ).toBeNull()
  })
})
