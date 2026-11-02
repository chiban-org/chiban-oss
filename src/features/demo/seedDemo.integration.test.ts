import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROLES } from '@/constants/roles'
import { users } from '@/db/schema'
import { DEMO_USERS, seedDemo } from '@/features/demo/seedDemo'
import { getTownSettings } from '@/features/town/settings'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
const signal = new AbortController().signal

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

async function counts(): Promise<Record<string, number>> {
  const result = await handle.db.execute<{ t: string; n: number }>(sql`
    select 'users' as t, count(*)::int as n from users
    union all select 'user_roles', count(*)::int from user_roles
    union all select 'role_capabilities', count(*)::int from role_capabilities
    union all select 'town_settings', count(*)::int from town_settings
  `)
  return Object.fromEntries(result.rows.map((r) => [r.t, r.n]))
}

describe('seedDemo', () => {
  it('creates Alder Pond, default grants, and one user per role', async () => {
    const report = await seedDemo(handle.db, signal)
    expect(report.usersCreated).toBe(ROLES.length)
    const town = await getTownSettings(handle.db, signal)
    expect(town).toEqual({
      ok: true,
      value: { name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' },
    })
    const emails = (await handle.db.select({ email: users.email }).from(users)).map((u) => u.email)
    expect(emails.sort()).toEqual(DEMO_USERS.map((u) => u.email).sort())
    expect(emails.every((e) => e.endsWith('@alderpond.example'))).toBe(true)
  })

  it('names the nine seeded users by short role', () => {
    expect(DEMO_USERS.map((u) => u.email).sort()).toEqual(
      [
        'admin',
        'staff',
        'inspector',
        'finance',
        'records',
        'reviewer',
        'board',
        'applicant',
        'contractor',
      ]
        .map((n) => `${n}@alderpond.example`)
        .sort(),
    )
  })

  it('creates nothing and fails nothing on the second run', async () => {
    const before = await counts()
    const report = await seedDemo(handle.db, signal)
    expect(await counts()).toEqual(before)
    expect(report.usersCreated).toBe(0)
  })
})
