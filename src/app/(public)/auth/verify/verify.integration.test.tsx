import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { magicLinks, projectParties, projects } from '@/db/schema'
import { requestMagicLink, resetMagicLinkLimiter } from '@/features/auth/magicLink'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeParcel } from '@/test/parcels'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
  setCookies: { name: string; value: string }[]
}

const state = vi.hoisted(
  (): MockState => ({ db: null, csrfCookie: 'tok', actor: null, setCookies: [] }),
)

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
      set: (name: string, value: string) => {
        state.setCookies.push({ name, value })
      },
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
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { default: VerifyPage } = await import('@/app/(public)/auth/verify/page')
const { confirmMagicLinkAction } = await import('@/app/(public)/auth/verify/actions')

const signal = new AbortController().signal
let handle: TestDb
const mail = createMemoryTransport()

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.delete(magicLinks)
  resetMagicLinkLimiter()
  state.csrfCookie = 'tok'
  state.actor = null
  state.setCookies = []
  mail.sent.length = 0
})

async function tokenFor(email: string): Promise<string> {
  await requestMagicLink(handle.db, mail, { email: email, clientKey: 'client-1' }, signal)
  return /token=([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
}

async function consumed(): Promise<boolean[]> {
  const rows = await handle.db.select().from(magicLinks)
  return rows.map((r) => r.consumedAt !== null)
}

function form(token: string, csrf: string | null): FormData {
  const f = new FormData()
  f.set('token', token)
  if (csrf !== null) f.set('csrf_token', csrf)
  return f
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    return e instanceof Error ? e.message.replace('NEXT_REDIRECT:', '') : ''
  }
  return ''
}

describe('magic link verify page', () => {
  it('GET leaves the token unconsumed and sets no cookie', async () => {
    const token = await tokenFor('first@alderpond.example')
    const html = renderToStaticMarkup(
      await VerifyPage({ searchParams: Promise.resolve({ token }) }),
    )
    expect(html).toContain('Continue as first@alderpond.example')
    expect(await consumed()).toEqual([false])
    expect(state.setCookies).toEqual([])
  })

  it('GET with an unknown token says the link is no longer valid', async () => {
    const html = renderToStaticMarkup(
      await VerifyPage({ searchParams: Promise.resolve({ token: 'x'.repeat(43) }) }),
    )
    expect(html).toContain('no longer valid')
  })

  it('warns when a different account is signed in', async () => {
    const token = await tokenFor('target@alderpond.example')
    const other = await makeUser(handle.db, { email: 'other@alderpond.example', role: 'applicant' })
    state.actor = { userId: other, kind: 'public', roles: ['applicant'] }
    const html = renderToStaticMarkup(
      await VerifyPage({ searchParams: Promise.resolve({ token }) }),
    )
    expect(html).toContain('other@alderpond.example')
    expect(html).toContain('this will switch accounts')
  })

  it('POST with a valid CSRF token signs in', async () => {
    const token = await tokenFor('signer@alderpond.example')
    const target = await redirectOf(confirmMagicLinkAction(form(token, 'tok')))
    expect(target).toBe('/portal')
    expect(state.setCookies.map((c) => c.name)).toEqual(['chiban_sid'])
    expect(await consumed()).toEqual([true])
  })

  it('POST sends a board member to the board page when no page was asked for', async () => {
    await makeUser(handle.db, {
      email: 'member@alderpond.example',
      roles: ['applicant', 'board_member'],
      kind: 'public',
    })
    const token = await tokenFor('member@alderpond.example')
    expect(await redirectOf(confirmMagicLinkAction(form(token, 'tok')))).toBe('/board')
    await requestMagicLink(
      handle.db,
      mail,
      { email: 'member@alderpond.example', clientKey: 'client-1', next: '/parcels' },
      signal,
    )
    const asked = /token=([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    expect(await redirectOf(confirmMagicLinkAction(form(asked, 'tok')))).toBe('/parcels')
  })

  it('POST sends a contractor with only contractor projects to the contractor page', async () => {
    const contractorId = await makeUser(handle.db, {
      email: 'builder@alderpond.example',
      role: 'contractor',
    })
    const parcelId = await makeParcel(handle.db, [])
    const [project] = await handle.db
      .insert(projects)
      .values({ parcelId, title: 'Barn', createdBy: contractorId })
      .returning({ id: projects.id })
    await handle.db.insert(projectParties).values({
      projectId: project?.id ?? '',
      userId: contractorId,
      name: 'Builder',
      role: 'contractor',
      addedBy: contractorId,
    })
    const token = await tokenFor('builder@alderpond.example')
    expect(await redirectOf(confirmMagicLinkAction(form(token, 'tok')))).toBe('/portal/contractor')
  })

  it('POST without the CSRF token does not consume the link', async () => {
    const token = await tokenFor('noscrf@alderpond.example')
    const target = await redirectOf(confirmMagicLinkAction(form(token, null)))
    expect(target).toBe('/sign-in?error=invalid')
    expect(state.setCookies).toEqual([])
    expect(await consumed()).toEqual([false])
  })

  it('POST with an invalid token goes back to sign in', async () => {
    const target = await redirectOf(confirmMagicLinkAction(form('y'.repeat(43), 'tok')))
    expect(target).toBe('/sign-in?error=invalid')
  })
  it('a repeat submit of an already consumed link by the signed-in user still lands home', async () => {
    const token = await tokenFor('twice@alderpond.example')
    expect(await redirectOf(confirmMagicLinkAction(form(token, 'tok')))).toBe('/portal')
    const userId = await makeUser(handle.db, {
      email: 'twice-actor@alderpond.example',
      role: 'applicant',
    })
    state.actor = { userId, kind: 'public', roles: ['applicant'] }
    expect(await redirectOf(confirmMagicLinkAction(form(token, 'tok')))).toBe('/portal')
  })

  it('a link that cannot start a session is not consumed', async () => {
    const token = await tokenFor('taken@alderpond.example')
    await makeUser(handle.db, { email: 'taken@alderpond.example', role: 'staff' })
    const target = await redirectOf(confirmMagicLinkAction(form(token, 'tok')))
    expect(target).toBe('/sign-in?error=invalid')
    expect(await consumed()).toEqual([false])
  })
})
