import { describe, expect, it } from 'vitest'
import { sniffMatches } from '@/features/files/sniff'

describe('sniffMatches', () => {
  it('pdf magic bytes match application/pdf', () => {
    expect(sniffMatches('application/pdf', new TextEncoder().encode('%PDF-1.7\n'))).toBe(true)
  })

  it('png bytes declared as pdf do not match', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
    expect(sniffMatches('application/pdf', png)).toBe(false)
    expect(sniffMatches('image/png', png)).toBe(true)
  })

  it('jpeg bytes match image/jpeg', () => {
    expect(sniffMatches('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
  })

  it('a file shorter than the signature does not match', () => {
    expect(sniffMatches('application/pdf', new Uint8Array([0x25, 0x50]))).toBe(false)
  })
})
