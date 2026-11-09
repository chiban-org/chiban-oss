import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Actor, loadActor } from '@/features/auth/actor'
import { sendContractorClaim } from '@/features/contractors/claims'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
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
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { default: ClaimPage } = await import('./page')
const { claimProjectAction } = await import('./actions')
const { default: Dashboard } = await import('@/app/(public)/portal/contractor/page')

const signal = new AbortController().signal
const EMAIL = 'pat@alderpond.example'
let handle: TestDb
let world: PermitWorld
let token = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  const mail = createMemoryTransport()
  await sendContractorClaim(
    handle.db,
    mail,
    world.staff,
    { projectId: world.projectId, email: EMAIL, name: 'Pat' },
    signal,
  )
  token = /\/claim\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? '')?.[1] ?? ''
})
afterAll(async () => {
  await handle.drop()
})

function form(value: string): FormData {
  const f = new FormData()
  f.set('token', value)
  f.set('csrf_token', 'tok')
  return f
}

describe('claim page', () => {
  it('sends a signed-out visitor to sign in and back', async () => {
    state.actor = null
    const html = renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ token }) }))
    expect(html).toContain(`/sign-in?next=${encodeURIComponent(`/claim/${token}`)}`)
  })

  it('names the project, its address and the email the link was sent to before anyone signs in', async () => {
    state.actor = null
    const html = renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ token }) }))
    expect(html).toContain('Garage addition')
    expect(html).toContain(EMAIL)
  })

  it('says a well-formed link that is unknown or used has expired or was already used', async () => {
    state.actor = null
    const unknown = 'A'.repeat(43)
    const html = renderToStaticMarkup(
      await ClaimPage({ params: Promise.resolve({ token: unknown }) }),
    )
    expect(html).toContain('This link has expired or was already used.')
    expect(html).not.toContain('Sign in to claim')
  })

  it('an invalid link offers a way on: sign in when signed out, contractor projects when signed in', async () => {
    state.actor = null
    const out = renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ token: 'bad' }) }))
    expect(out).toContain('This link has expired or was already used.')
    expect(out).toContain('href="/sign-in"')
    expect(out).toContain('href="/"')
    const id = await makeUser(handle.db, { role: 'contractor', email: 'someone@alderpond.example' })
    state.actor = await loadActor(handle.db, id, signal)
    const signedIn = renderToStaticMarkup(
      await ClaimPage({ params: Promise.resolve({ token: 'bad' }) }),
    )
    expect(signedIn).toContain('href="/portal/contractor"')
    expect(signedIn).not.toContain('href="/sign-in"')
  })

  it('a different signed-in address is told the link was sent elsewhere', async () => {
    const id = await makeUser(handle.db, { role: 'contractor', email: 'other@alderpond.example' })
    state.actor = await loadActor(handle.db, id, signal)
    const result = await claimProjectAction(form(token))
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).toContain('different email address')
  })

  it('the right address claims, lands on the dashboard, and sees the project', async () => {
    const id = await makeUser(handle.db, { role: 'contractor', email: EMAIL })
    state.actor = await loadActor(handle.db, id, signal)
    await expect(claimProjectAction(form(token))).rejects.toThrow(
      'NEXT_REDIRECT:/portal/contractor',
    )
    const html = renderToStaticMarkup(await Dashboard({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Garage addition')
  })

  it('the dashboard sends a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(Dashboard({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/sign-in?next=%2Fportal%2Fcontractor',
    )
  })
})
