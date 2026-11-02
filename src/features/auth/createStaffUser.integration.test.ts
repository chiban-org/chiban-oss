import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { userRoles, users } from '@/db/schema'
import { createStaffUser } from '@/features/auth/createStaffUser'
import { verifyPassword } from '@/features/auth/password'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
const signal = new AbortController().signal

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

describe('createStaffUser', () => {
  it('creates a staff user with a hashed password and the role', async () => {
    const result = await createStaffUser(
      handle.db,
      {
        email: 'New@alderpond.example',
        displayName: 'New Clerk',
        role: 'staff',
        password: 'long-enough-password',
      },
      signal,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [user] = await handle.db.select().from(users).where(eq(users.id, result.value.userId))
    expect(user?.kind).toBe('staff')
    expect(await verifyPassword('long-enough-password', user?.passwordHash ?? '', signal)).toBe(
      true,
    )
    const roles = await handle.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, result.value.userId))
    expect(roles.map((r) => r.role)).toEqual(['staff'])
  })

  it('rejects a public role, a short password, and a duplicate email', async () => {
    const base = {
      email: 'dup@alderpond.example',
      displayName: 'D',
      role: 'staff' as const,
      password: 'long-enough-password',
    }
    expect(await createStaffUser(handle.db, { ...base, role: 'applicant' }, signal)).toEqual({
      ok: false,
      error: 'invalid_role',
    })
    expect(await createStaffUser(handle.db, { ...base, password: 'short' }, signal)).toEqual({
      ok: false,
      error: 'weak_password',
    })
    expect((await createStaffUser(handle.db, base, signal)).ok).toBe(true)
    expect(await createStaffUser(handle.db, base, signal)).toEqual({
      ok: false,
      error: 'email_taken',
    })
  })
})
