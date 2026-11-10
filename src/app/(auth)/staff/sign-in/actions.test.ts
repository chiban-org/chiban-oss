import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ set: () => undefined }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/server/actionGuard', () => ({ guardAction: () => Promise.resolve({ ok: true }) }))
vi.mock('@/features/auth/staffSignIn', () => ({
  staffSignIn: () => Promise.resolve({ ok: true, value: { sid: 's1' } }),
}))
vi.mock('@/features/auth/devSignIn', () => ({
  devSignIn: () => Promise.resolve({ ok: true, value: { sid: 's1' } }),
  isDevSignInEnabled: () => true,
}))

const { signInAction } = await import('./actions')
const { devSignInAction } = await import('../../dev/sign-in/actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe('staff sign-in landing', () => {
  it('sends a signed-in staff member to the start page for their role', async () => {
    await expect(
      signInAction({ error: null, needTotp: false }, form({ email: 'a@x.test', password: 'p' })),
    ).rejects.toThrow(/^NEXT_REDIRECT:\/staff$/)
  })

  it('sends a dev staff sign-in to the start page and a public one to the portal', async () => {
    await expect(devSignInAction(form({ email: 'a@x.test', kind: 'staff' }))).rejects.toThrow(
      /^NEXT_REDIRECT:\/staff$/,
    )
    await expect(devSignInAction(form({ email: 'a@x.test', kind: 'public' }))).rejects.toThrow(
      /^NEXT_REDIRECT:\/$/,
    )
  })
})
