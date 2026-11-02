import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'

const state = vi.hoisted((): { actor: Actor | null } => ({ actor: null }))

vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { requireStaffActor } = await import('@/server/requireStaff')

const signal = new AbortController().signal

beforeEach(() => {
  state.actor = null
})

describe('requireStaffActor', () => {
  it('sends a signed-out caller to staff sign in', async () => {
    await expect(requireStaffActor(signal)).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('sends a public actor to staff sign in', async () => {
    state.actor = { userId: 'u', kind: 'public', roles: ['applicant'] }
    await expect(requireStaffActor(signal)).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('returns a staff actor', async () => {
    state.actor = { userId: 'u', kind: 'staff', roles: ['staff'] }
    expect(await requireStaffActor(signal)).toEqual(state.actor)
  })
})
