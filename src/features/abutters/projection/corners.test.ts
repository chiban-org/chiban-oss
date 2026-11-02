import { describe, expect, it } from 'vitest'
import { findCorners, prepareRing } from '@/features/abutters/projection/corners'
import { frontageRuns } from '@/features/abutters/projection/frontage'
import {
  KINGFISHER_CENTERLINE,
  OSPREY_CENTERLINE,
  PARAMS,
  PARCEL_A,
  PARCEL_K,
  polar,
  rect,
} from '@/features/abutters/projection/testKit'
import type { Pt } from '@/features/abutters/projection/vec'

describe('prepareRing', () => {
  it('drops the closing duplicate and orients counterclockwise', () => {
    const clockwise: Pt[] = [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
      [0, 0],
    ]
    const prepared = prepareRing(clockwise, PARAMS)
    expect(prepared).toHaveLength(4)
    const area = prepared.reduce((acc, p, i) => {
      const q = prepared[(i + 1) % prepared.length] as Pt
      return acc + (p[0] * q[1] - q[0] * p[1])
    }, 0)
    expect(area).toBeGreaterThan(0)
  })

  it('removes a collinear vertex and 0.5 ft jitter on a long edge', () => {
    const jittered: Pt[] = [
      [0, 0],
      [100, 0.5],
      [200, 0],
      [200, 100],
      [0, 100],
      [0, 0],
    ]
    expect(prepareRing(jittered, PARAMS)).toHaveLength(4)
  })
})

describe('findCorners', () => {
  it('rectangle with a collinear extra vertex has 4 corners', () => {
    const ring = prepareRing(
      [
        [0, 0],
        [100, 0],
        [200, 0],
        [200, 100],
        [0, 100],
        [0, 0],
      ],
      PARAMS,
    )
    expect(findCorners(ring, null, PARAMS)).toHaveLength(4)
  })

  it('0.5 ft digitizing jitter does not add corners', () => {
    const ring = prepareRing(
      [
        [0, 0],
        [60, 0.5],
        [120, -0.5],
        [200, 0],
        [200, 60],
        [199.5, 120],
        [200, 200],
        [0, 200],
        [0.5, 100],
        [0, 0],
      ],
      PARAMS,
    )
    expect(findCorners(ring, null, PARAMS)).toHaveLength(4)
  })

  it('curved frontage of 12 vertices yields only its 2 end corners', () => {
    const ring = prepareRing(PARCEL_K, PARAMS)
    const runs = frontageRuns(ring, KINGFISHER_CENTERLINE, PARAMS)
    expect(runs).toHaveLength(1)
    const corners = findCorners(ring, runs[0] ?? null, PARAMS)
    expect(corners).toHaveLength(2)
    const [first, second] = [...corners].sort(
      (a, b) => Math.atan2(a[1], a[0] - 7000) - Math.atan2(b[1], b[0] - 7000),
    ) as [Pt, Pt]
    for (const [corner, angle] of [
      [first, 200],
      [second, 230],
    ] as [Pt, number][]) {
      const expected = polar(7000, angle, 525)
      expect(Math.hypot(corner[0] - expected[0], corner[1] - expected[1])).toBeLessThan(0.5)
    }
  })

  it('a bent frontage yields its bend', () => {
    const ring: Pt[] = [
      [0, -200],
      [300, -200],
      [300, 80],
      [160, 80],
      [100, 0],
      [0, 0],
    ]
    expect(findCorners(ring, { start: 2, end: 5 }, PARAMS)).toEqual([
      [300, 80],
      [160, 80],
      [100, 0],
      [0, 0],
    ])
  })
})

describe('frontageRuns', () => {
  it('frontage run on A is the north edge only', () => {
    const ring = prepareRing(PARCEL_A, PARAMS)
    const runs = frontageRuns(ring, OSPREY_CENTERLINE, PARAMS)
    expect(runs).toHaveLength(1)
    const corners = findCorners(ring, runs[0] ?? null, PARAMS)
    expect(corners.map((c) => c.map(Math.round))).toEqual([
      [800, -25],
      [400, -25],
    ])
  })

  it('a ring far from the feature has no frontage run', () => {
    expect(
      frontageRuns(prepareRing(rect(0, 100, 500, 600), PARAMS), OSPREY_CENTERLINE, PARAMS),
    ).toEqual([])
  })
})
