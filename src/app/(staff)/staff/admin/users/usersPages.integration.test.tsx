import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { staffWith } from '@/test/staffUsers'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/staff/admin/users',
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/mail/transport', () => ({
  getMailTransport: () => ({ send: () => Promise.resolve({ ok: true, value: undefined }) }),
}))

const actions = await import('@/app/(staff)/staff/admin/users/actions')
const { default: UsersPage } = await import('@/app/(staff)/staff/admin/users/page')
const { default: UserPage } = await import('@/app/(staff)/staff/admin/users/[userId]/page')
const { default: InvitePage } = await import('@/app/(staff)/staff/admin/users/invite/page')

let handle: TestDb
let admin: Actor
let clerk: Actor
let target = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDefaultGrants(handle.db, new AbortController().signal)
  admin = await staffWith(handle.db, ['admin'])
  clerk = await staffWith(handle.db, ['staff'])
  target = await makeUser(handle.db, { role: 'inspector', totpEnabled: true })
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) {
    for (const value of Array.isArray(v) ? v : [v]) f.append(k, value)
  }
  return f
}

async function html(element: Promise<unknown>): Promise<string> {
  return renderToStaticMarkup((await element) as never)
}

describe('staff account actions', () => {
  it('refuses every action to a staff member without user.manage', async () => {
    state.actor = clerk
    const refused = { ok: false, error: 'You do not have permission to manage staff accounts.' }
    const byId = form({ userId: target })
    const results = await Promise.all([
      actions.inviteStaffAction(
        form({ displayName: 'X', email: 'x@alderpond.example', roles: ['staff'] }),
      ),
      actions.resendInviteAction(byId),
      actions.revokeInviteAction(byId),
      actions.setRolesAction(form({ userId: target, roles: ['admin'] })),
      actions.disableAction(form({ userId: target, reason: 'Gone' })),
      actions.enableAction(byId),
      actions.resetAuthenticatorAction(byId),
      actions.sendResetAction(byId),
    ])
    for (const result of results) expect(result).toEqual(refused)
  })

  it('invites and opens the new account for an administrator', async () => {
    state.actor = admin
    await expect(
      actions.inviteStaffAction(
        form({
          displayName: 'Quinn Clerk',
          email: 'quinn@alderpond.example',
          roles: ['staff', 'finance'],
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT:\/staff\/admin\/users\/[0-9a-f-]{36}\?notice=invited/)
  })
})

describe('staff account pages', () => {
  it('shows a permission refusal to a staff member without user.manage', async () => {
    state.actor = clerk
    const searchParams = Promise.resolve({})
    expect(await html(UsersPage({ searchParams }))).toContain(
      'You do not have permission to manage staff accounts.',
    )
    expect(await html(InvitePage())).toContain('You do not have permission')
    expect(
      await html(UserPage({ params: Promise.resolve({ userId: target }), searchParams })),
    ).toContain('You do not have permission')
  })

  it('lists accounts and opens a record page for an administrator', async () => {
    state.actor = admin
    const list = await html(UsersPage({ searchParams: Promise.resolve({}) }))
    expect(list).toContain('Invite staff')
    expect(list).toContain(`/staff/admin/users/${target}`)
    const page = await html(
      UserPage({ params: Promise.resolve({ userId: target }), searchParams: Promise.resolve({}) }),
    )
    expect(page).toContain('Reset authenticator')
    expect(page).toContain('Disable this account')
    const own = await html(
      UserPage({
        params: Promise.resolve({ userId: admin.userId }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(own).toContain('You cannot disable your own account.')
    expect(own).not.toContain('Disable this account')
  })
})
