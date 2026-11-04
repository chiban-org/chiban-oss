import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import type { CoverageContext } from '@/features/demo/seedCoverage'
import {
  DISABLED_STAFF_EMAIL,
  PENDING_INVITE_EMAIL,
  seedUserStates,
} from '@/features/demo/seedUserStates'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { loadUserList } from '@/features/users/userList'
import { USER_SORT } from '@/features/users/userListParams'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let ctx: CoverageContext

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
  const admin = await staffWith(handle.db, ['admin'])
  ctx = {
    db: handle.db,
    store: {} as CoverageContext['store'],
    mail: createMemoryTransport(),
    signal,
    now: new Date(),
    today: '2026-11-04' as CivilDate,
    cast: { admin, staff: admin, applicant: admin },
  }
})
afterAll(async () => {
  await handle.drop()
})

describe('demo staff account states', () => {
  it('gives the invited and disabled tabs one row each, once', async () => {
    expect(await seedUserStates(ctx)).toBe(true)
    expect(await seedUserStates(ctx)).toBe(false)
    const sort = { key: USER_SORT.defaultKey, dir: 'asc' as const }
    const tab = async (name: 'invited' | 'disabled') =>
      (await loadUserList(handle.db, ctx.cast.admin, { tab: name, sort }, signal))?.rows.map(
        (r) => r.email,
      )
    expect(await tab('invited')).toEqual([PENDING_INVITE_EMAIL])
    expect(await tab('disabled')).toEqual([DISABLED_STAFF_EMAIL])
  })
})
