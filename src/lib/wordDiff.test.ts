import { describe, expect, it } from 'vitest'
import { diffWords } from '@/lib/wordDiff'

describe('diffWords', () => {
  it('returns one unchanged segment for equal text', () => {
    expect(diffWords('Roofs shall carry 30 psf.', 'Roofs shall carry 30 psf.')).toEqual([
      { kind: 'same', text: 'Roofs shall carry 30 psf.' },
    ])
  })

  it('marks a replaced word as removed then added', () => {
    expect(diffWords('carry 30 psf', 'carry 60 psf')).toEqual([
      { kind: 'same', text: 'carry ' },
      { kind: 'removed', text: '30' },
      { kind: 'added', text: '60' },
      { kind: 'same', text: ' psf' },
    ])
  })

  it('marks inserted words as added', () => {
    expect(diffWords('a c', 'a b c')).toEqual([
      { kind: 'same', text: 'a ' },
      { kind: 'added', text: 'b ' },
      { kind: 'same', text: 'c' },
    ])
  })

  it('marks deleted words as removed', () => {
    expect(diffWords('a b c', 'a c')).toEqual([
      { kind: 'same', text: 'a ' },
      { kind: 'removed', text: 'b ' },
      { kind: 'same', text: 'c' },
    ])
  })

  it('handles an empty side', () => {
    expect(diffWords('', 'new text')).toEqual([{ kind: 'added', text: 'new text' }])
    expect(diffWords('old text', '')).toEqual([{ kind: 'removed', text: 'old text' }])
    expect(diffWords('', '')).toEqual([])
  })

  it('keeps line breaks as part of the text', () => {
    const parts = diffWords('one\ntwo', 'one\nthree')
    expect(parts[0]).toEqual({ kind: 'same', text: 'one\n' })
    expect(parts.map((p) => p.text).join('')).toBe('one\ntwothree')
  })

  it('rebuilds both sides from the segments', () => {
    const before = 'The ground snow load is 50 pounds per square foot for all roofs.'
    const after = 'The ground snow load is 70 pounds per square foot for all new roofs.'
    const parts = diffWords(before, after)
    const old = parts.filter((p) => p.kind !== 'added')
    const next = parts.filter((p) => p.kind !== 'removed')
    expect(old.map((p) => p.text).join('')).toBe(before)
    expect(next.map((p) => p.text).join('')).toBe(after)
  })
})
