import { beforeEach, describe, expect, it, vi } from 'vitest'

const guard = vi.hoisted((): { result: unknown } => ({
  result: { ok: true, value: { kind: 'public' } },
}))

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/actionGuard', () => ({ guardAction: () => Promise.resolve(guard.result) }))

const { revalidatePath } = await import('next/cache')
const { withPortalActor } = await import('./portalAction')

type Result = { ok: true } | { ok: false; error: string }

const fail = (error: string): Result => ({ ok: false, error })
const succeed = (): Promise<Result> => Promise.resolve({ ok: true })

describe('withPortalActor', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear()
    guard.result = { ok: true, value: { kind: 'public' } }
  })

  it('refreshes the portal after an action succeeds', async () => {
    await withPortalActor(new FormData(), fail, succeed)
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/portal', 'layout')
  })

  it('leaves the portal alone when the action fails', async () => {
    await withPortalActor(new FormData(), fail, () => Promise.resolve(fail('No.')))
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })

  it('leaves the portal alone when a signed-out person posts', async () => {
    guard.result = { ok: true, value: null }
    const result = await withPortalActor(new FormData(), fail, succeed)
    expect(result.ok).toBe(false)
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})
