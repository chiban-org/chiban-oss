import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '@/db/schema'
import { hashPassword } from '@/features/auth/password'
import { makeUser } from '@/test/factories'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('@/app/(staff)/staff/account/actions')
const { resetPasswordChangeLimiter } = await import('@/features/auth/accountChanges')

const signal = new AbortController().signal
const OLD = 'old password 12345'
const NEW = 'new password 67890'
const h = actionHarness()

beforeEach(() => {
  resetPasswordChangeLimiter()
})

const idle = { error: null, message: null }

async function signedInUser(): Promise<string> {
  const userId = await makeUser(h.db, { passwordHash: await hashPassword(OLD, signal) })
  h.signIn({ userId, kind: 'staff', roles: ['staff'] })
  return userId
}

describe('account actions', () => {
  it.each([
    ['changeNameAction', actions.changeNameAction],
    ['changePasswordAction', actions.changePasswordAction],
  ])('%s rejects a missing csrf token', async (_name, action) => {
    await signedInUser()
    expect(await action(idle, h.form({}, null))).toMatchObject({
      error: expect.stringContaining('session expired'),
    })
  })

  it.each([
    ['changeNameAction', actions.changeNameAction],
    ['changePasswordAction', actions.changePasswordAction],
  ])('%s sends a signed-out caller to sign in', async (_name, action) => {
    h.signOut()
    await expect(action(idle, h.form({}))).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('saves a new name for the signed-in person only', async () => {
    const userId = await signedInUser()
    const other = await makeUser(h.db)
    const before = (await h.db.select().from(users).where(eq(users.id, other)))[0]
    expect(await actions.changeNameAction(idle, h.form({ displayName: 'Rae Records' }))).toEqual({
      error: null,
      message: 'Name saved.',
    })
    const [mine] = await h.db.select().from(users).where(eq(users.id, userId))
    const [theirs] = await h.db.select().from(users).where(eq(users.id, other))
    expect(mine?.displayName).toBe('Rae Records')
    expect(theirs?.displayName).toBe(before?.displayName)
  })

  it('refuses a password change with the wrong current password', async () => {
    await signedInUser()
    const result = await actions.changePasswordAction(
      idle,
      h.form({ current: 'nope nope nope 1', password: NEW, confirm: NEW }),
    )
    expect(result).toEqual({ error: 'The current password is not right.', message: null })
  })

  it('refuses when the two new passwords differ', async () => {
    await signedInUser()
    const result = await actions.changePasswordAction(
      idle,
      h.form({ current: OLD, password: NEW, confirm: `${NEW}x` }),
    )
    expect(result.error).toBe('The two new passwords do not match.')
  })

  it('changes the password when the current one is given', async () => {
    await signedInUser()
    const result = await actions.changePasswordAction(
      idle,
      h.form({ current: OLD, password: NEW, confirm: NEW }),
    )
    expect(result.error).toBeNull()
    expect(result.message).toContain('Password changed')
  })
})
