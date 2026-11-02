import { describe, expect, it } from 'vitest'
import { AppError } from '@/constants/errorIds'
import { assertNever, err, ok } from '@/types/result'

describe('Result', () => {
  it('ok carries the value', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
  })

  it('err carries the error', () => {
    expect(err('x')).toEqual({ ok: false, error: 'x' })
  })

  it('assertNever throws AppError', () => {
    expect(() => assertNever('boom' as never)).toThrow(AppError)
  })
})
