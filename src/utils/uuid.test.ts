import { describe, expect, it } from 'vitest'
import { isUuid } from '@/utils/uuid'

describe('isUuid', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
  })
})
