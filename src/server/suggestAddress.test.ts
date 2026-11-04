import { beforeEach, describe, expect, it, vi } from 'vitest'

interface State {
  guard: unknown
  calls: { lines: readonly string[]; userKey: string }[]
  answer: unknown
}

const state = vi.hoisted(
  (): State => ({
    guard: { ok: true, value: { userId: 'user-1', kind: 'public', roles: [] } },
    calls: [],
    answer: { lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'], matches: false },
  }),
)

vi.mock('@/server/actionGuard', () => ({ guardAction: () => Promise.resolve(state.guard) }))
vi.mock('@/features/usps/uspsRuntime', () => ({
  addressSuggester: {
    suggest: (lines: readonly string[], userKey: string) => {
      state.calls.push({ lines, userKey })
      return Promise.resolve(state.answer)
    },
  },
}))

const { suggestAddress } = await import('./suggestAddress')

const INPUT = { csrfToken: 'token', lines: ['1 Main Street, Alder Pond NH'] }

describe('suggestAddress', () => {
  beforeEach(() => {
    state.guard = { ok: true, value: { userId: 'user-1', kind: 'public', roles: [] } }
    state.calls = []
    state.answer = { lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'], matches: false }
  })

  it('looks the address up for a signed-in person, limited by their user id', async () => {
    expect(await suggestAddress(INPUT)).toEqual({
      lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'],
      matches: false,
    })
    expect(state.calls).toEqual([{ lines: INPUT.lines, userKey: 'user-1' }])
  })

  it('returns nothing to a signed-out visitor and looks nothing up', async () => {
    state.guard = { ok: true, value: null }
    expect(await suggestAddress(INPUT)).toBeNull()
    expect(state.calls).toEqual([])
  })

  it('returns nothing when the request fails the CSRF check', async () => {
    state.guard = { ok: false, error: 'csrf' }
    expect(await suggestAddress(INPUT)).toBeNull()
    expect(state.calls).toEqual([])
  })

  it('returns nothing for input that is not a list of short lines', async () => {
    expect(await suggestAddress({ csrfToken: 'token', lines: 'x' })).toBeNull()
    expect(await suggestAddress({ csrfToken: 'token', lines: ['x'.repeat(301)] })).toBeNull()
    expect(state.calls).toEqual([])
  })

  it('returns nothing when the lookup has nothing', async () => {
    state.answer = null
    expect(await suggestAddress(INPUT)).toBeNull()
  })

  it('sends back only the suggested lines and whether they match', async () => {
    state.answer = { lines: ['1 MAIN ST'], matches: true, token: 'secret' }
    expect(await suggestAddress(INPUT)).toEqual({ lines: ['1 MAIN ST'], matches: true })
  })
})
