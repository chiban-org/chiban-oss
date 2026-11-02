import { describe, expect, it } from 'vitest'
import { safeNext } from '@/features/auth/safeNext'

describe('safeNext', () => {
  it('rejects //evil.example and keeps /claim/abc', () => {
    expect(safeNext('//evil.example')).toBe('/portal')
    expect(safeNext('/claim/abc')).toBe('/claim/abc')
  })

  it('rejects backslash tricks, absolute urls, and empty values', () => {
    expect(safeNext('/\\evil.example')).toBe('/portal')
    expect(safeNext('https://evil.example')).toBe('/portal')
    expect(safeNext('javascript:alert(1)')).toBe('/portal')
    expect(safeNext(null)).toBe('/portal')
    expect(safeNext('')).toBe('/portal')
  })

  it('rejects control characters', () => {
    expect(safeNext('/claim/a\nb')).toBe('/portal')
  })
})
