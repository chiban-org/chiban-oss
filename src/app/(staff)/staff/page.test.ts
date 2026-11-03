import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'

const state = vi.hoisted((): { actor: Actor | null } => ({ actor: null }))

vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: StaffHome } = await import('./page')

beforeEach(() => {
  state.actor = null
})

describe('/staff', () => {
  it('redirects a signed-out visitor to sign in instead of returning 404', async () => {
    await expect(StaffHome()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })

  it('lands an inspector on the day list', async () => {
    state.actor = { userId: 'u', kind: 'staff', roles: ['inspector'] }
    await expect(StaffHome()).rejects.toThrow('NEXT_REDIRECT:/staff/inspections/day')
  })
})
