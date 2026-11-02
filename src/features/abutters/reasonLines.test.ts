import { describe, expect, it } from 'vitest'
import { reasonLines } from '@/features/abutters/reasonText'

describe('reasonLines', () => {
  it('a parcel across a street between the points is not also listed as within capture', () => {
    expect(
      reasonLines([
        { kind: 'across_between_points', featureId: 'f1', featureName: 'Osprey Point Road' },
        { kind: 'across_within_capture', featureId: 'f1', distanceFt: 0 },
      ]),
    ).toEqual(['Across Osprey Point Road, between the projected points'])
  })

  it('a capture on another street still shows', () => {
    expect(
      reasonLines([
        { kind: 'across_between_points', featureId: 'f1', featureName: 'Osprey Point Road' },
        { kind: 'across_within_capture', featureId: 'f2', distanceFt: 12 },
      ]),
    ).toHaveLength(2)
  })
})
