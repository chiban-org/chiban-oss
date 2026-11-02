import { describe, expect, it } from 'vitest'
import { attempt } from '@/lib/attempt'

describe('attempt', () => {
  it('yields ok with the value and clears pending', async () => {
    const pending: boolean[] = []
    const r = await attempt(
      () => Promise.resolve(5),
      (p) => pending.push(p),
    )
    expect(r).toEqual({ ok: true, value: 5 })
    expect(pending).toEqual([true, false])
  })

  it('yields an error value instead of throwing and still clears pending', async () => {
    const pending: boolean[] = []
    const r = await attempt(
      () => Promise.reject(new Error('network down')),
      (p) => pending.push(p),
    )
    expect(r).toEqual({ ok: false, error: 'network down' })
    expect(pending).toEqual([true, false])
  })
})
