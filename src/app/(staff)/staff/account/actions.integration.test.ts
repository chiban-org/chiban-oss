import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '@/db/schema'
import { hashPassword } from '@/features/auth/password'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('@/app/(staff)/staff/account/actions')
const { resetPasswordChangeLimiter } = await import('@/features/auth/accountChanges')

const signal = new AbortController().signal
const OLD = 'old password 12345'
const NEW = 'new password 67890'
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  resetPasswordChangeLimiter()
})

const idle = { error: null, message: null }

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function signedInUser(): Promise<string> {
  const userId = await makeUser(handle.db, { passwordHash: await hashPassword(OLD, signal) })
  state.actor = { userId, kind: 'staff', roles: ['staff'] }
  return userId
}

describe('account actions', () => {
  it.each([
    ['changeNameAction', actions.changeNameAction],
    ['changePasswordAction', actions.changePasswordAction],
  ])('%s rejects a missing csrf token', async (_name, action) => {
    await signedInUser()
    expect(await action(idle, form({}, null))).toMatchObject({
      error: expect.stringContaining('session expired'),
    })
  })

  it.each([
    ['changeNameAction', actions.changeNameAction],
    ['changePasswordAction', actions.changePasswordAction],
  ])('%s sends a signed-out caller to sign in', async (_name, action) => {
    state.actor = null
    await expect(action(idle, form({}))).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('saves a new name for the signed-in person only', async () => {
    const userId = await signedInUser()
    const other = await makeUser(handle.db)
    const before = (await handle.db.select().from(users).where(eq(users.id, other)))[0]
    expect(await actions.changeNameAction(idle, form({ displayName: 'Rae Records' }))).toEqual({
      error: null,
      message: 'Name saved.',
    })
    const [mine] = await handle.db.select().from(users).where(eq(users.id, userId))
    const [theirs] = await handle.db.select().from(users).where(eq(users.id, other))
    expect(mine?.displayName).toBe('Rae Records')
    expect(theirs?.displayName).toBe(before?.displayName)
  })

  it('refuses a password change with the wrong current password', async () => {
    await signedInUser()
    const result = await actions.changePasswordAction(
      idle,
      form({ current: 'nope nope nope 1', password: NEW, confirm: NEW }),
    )
    expect(result).toEqual({ error: 'The current password is not right.', message: null })
  })

  it('refuses when the two new passwords differ', async () => {
    await signedInUser()
    const result = await actions.changePasswordAction(
      idle,
      form({ current: OLD, password: NEW, confirm: `${NEW}x` }),
    )
    expect(result.error).toBe('The two new passwords do not match.')
  })

  it('changes the password when the current one is given', async () => {
    await signedInUser()
    const result = await actions.changePasswordAction(
      idle,
      form({ current: OLD, password: NEW, confirm: NEW }),
    )
    expect(result.error).toBeNull()
    expect(result.message).toContain('Password changed')
  })
})
