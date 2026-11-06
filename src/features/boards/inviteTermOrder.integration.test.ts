import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boardMemberships, users } from '@/db/schema'
import { inviteBoardMember } from '@/features/boards/members'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('inviteBoardMember term order', () => {
  it('refuses a term that ends before it starts, as the edit form does, before creating anyone', async () => {
    const mail = createMemoryTransport()
    const result = await inviteBoardMember(
      handle.db,
      mail,
      world.staff,
      {
        email: 'early.end@alderpond.example',
        displayName: 'Early End',
        board: 'zba',
        title: 'member',
        termStart: d('2026-11-01'),
        termEnd: d('2026-10-01'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'term_order' })
    expect(await handle.db.select().from(boardMemberships)).toEqual([])
    const invitedUsers = await handle.db.select({ email: users.email }).from(users)
    expect(invitedUsers.map((u) => u.email)).not.toContain('early.end@alderpond.example')
    expect(mail.sent).toEqual([])
  })
})
