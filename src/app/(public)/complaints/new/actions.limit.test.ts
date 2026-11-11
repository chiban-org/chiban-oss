import { beforeEach, describe, expect, it, vi } from 'vitest'

const decoded = vi.hoisted(() => ({ calls: 0 }))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.9' })),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/server/actionGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/actionGuard')>()),
  guardAction: () => Promise.resolve({ ok: true }),
}))
vi.mock('@/features/anonymousIntake/sanitizeImage', () => ({
  sanitizeImage: () => {
    decoded.calls += 1
    return Promise.resolve({ ok: false, error: 'invalid' })
  },
}))

const { submitComplaintAction } = await import('./actions')
const { resetComplaintLimits } = await import('@/features/enforcement/complaintLimits')

function formWithPhoto(): FormData {
  const data = new FormData()
  data.set('locationText', '12 Alder Pond Road')
  data.set('description', 'Debris in the yard')
  data.append('photos', new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' }))
  return data
}

beforeEach(() => {
  resetComplaintLimits()
  decoded.calls = 0
})

describe('submitComplaintAction rate limit', () => {
  it('refuses the sixth report from one connection before decoding any photo', async () => {
    for (let i = 0; i < 5; i += 1) await submitComplaintAction(formWithPhoto())
    expect(decoded.calls).toBe(5)
    const refused = await submitComplaintAction(formWithPhoto())
    expect(refused).toEqual({
      ok: false,
      error: 'Too many reports from this connection. Try again in a few minutes.',
    })
    expect(decoded.calls).toBe(5)
  })
})
