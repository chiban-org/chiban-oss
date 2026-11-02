import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'

const state = vi.hoisted(() => ({
  cookie: null as string | null,
  actor: null as Actor | null,
}))

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.cookie !== null ? { value: state.cookie } : undefined,
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

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/features/town/serviceStatus', () => ({
  currentServiceState: () => Promise.resolve({ mode: 'active', exportUntil: null }),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { guardAction } = await import('@/server/actionGuard')
const signal = new AbortController().signal

function form(token?: string): FormData {
  const f = new FormData()
  if (token !== undefined) f.set('csrf_token', token)
  return f
}

beforeEach(() => {
  state.cookie = 'tok'
  state.actor = null
})

describe('guardAction', () => {
  it('rejects a missing csrf token', async () => {
    expect(await guardAction(form(), signal)).toEqual({ ok: false, error: 'csrf' })
  })

  it('rejects a mismatched csrf token', async () => {
    expect(await guardAction(form('other'), signal)).toEqual({ ok: false, error: 'csrf' })
  })

  it('rejects when the csrf cookie is absent', async () => {
    state.cookie = null
    expect(await guardAction(form('tok'), signal)).toEqual({ ok: false, error: 'csrf' })
  })

  it('returns a null actor for an anonymous caller with a valid token', async () => {
    expect(await guardAction(form('tok'), signal)).toEqual({ ok: true, value: null })
  })

  it('returns the actor when signed in', async () => {
    state.actor = { userId: 'u1', kind: 'staff', roles: ['staff'] }
    expect(await guardAction({ csrfToken: 'tok' }, signal)).toEqual({
      ok: true,
      value: state.actor,
    })
  })
})
