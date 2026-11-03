import { describe, expect, it } from 'vitest'
import { ageText, provenanceText } from '@/features/abutters/reasonText'
import type { Provenance } from '@/features/abutters/resolution'

function source(patch: Partial<Provenance>): Provenance {
  return {
    source: 'parcel_record',
    ref: 'p1',
    asOf: '2027-03-01',
    ageDays: 0,
    state: 'fresh',
    ...patch,
  }
}

describe('provenanceText', () => {
  it('names the parcel layer on each recipient without repeating its import date', () => {
    expect(provenanceText(source({}))).toBe('Parcel layer')
    expect(provenanceText(source({ ageDays: 40, state: 'stale' }))).toBe(
      'Parcel layer, out of date',
    )
  })

  it('keeps a roster date and leaves out an age of zero days', () => {
    expect(provenanceText(source({ source: 'park_roster' }))).toBe(
      'Manufactured housing park roster as of March 1, 2027',
    )
    expect(provenanceText(source({ source: 'park_roster', ageDays: 3 }))).toBe(
      'Manufactured housing park roster as of March 1, 2027, 3 days old',
    )
  })
})

describe('ageText', () => {
  it('says nothing for an age of zero or unknown, and counts days otherwise', () => {
    expect(ageText(0)).toBe('')
    expect(ageText(null)).toBe('')
    expect(ageText(1)).toBe(', 1 day old')
    expect(ageText(23)).toBe(', 23 days old')
  })
})
