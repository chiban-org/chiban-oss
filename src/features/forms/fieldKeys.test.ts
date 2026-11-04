import { describe, expect, it } from 'vitest'
import { keyForLabel, slugKey } from '@/features/forms/fieldKeys'

describe('slugKey', () => {
  it('turns question text into a lower case key with underscores', () => {
    expect(slugKey('Type of work')).toBe('type_of_work')
    expect(slugKey('  Estimated cost ($) of the work? ')).toBe('estimated_cost_of_the_work')
    expect(slugKey('Owner’s e-mail')).toBe('owner_s_e_mail')
  })

  it('always starts with a letter and matches the stored key pattern', () => {
    expect(slugKey('2 story addition')).toBe('q_2_story_addition')
    expect(slugKey('')).toBe('question')
    expect(slugKey('???')).toBe('question')
    expect(slugKey('Écurie neuve')).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('keeps keys short', () => {
    const long = slugKey('Describe every part of the work you plan to do on the property this year')
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('_')).toBe(false)
  })
})

describe('keyForLabel', () => {
  it('adds a number when another question already uses the key', () => {
    expect(keyForLabel('Phone', new Set())).toBe('phone')
    expect(keyForLabel('Phone', new Set(['phone']))).toBe('phone_2')
    expect(keyForLabel('Phone', new Set(['phone', 'phone_2']))).toBe('phone_3')
  })
})
