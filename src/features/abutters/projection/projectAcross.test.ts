import { describe, expect, it } from 'vitest'
import { prepareRing } from '@/features/abutters/projection/corners'
import { projectAcross, projectCorner } from '@/features/abutters/projection/projectAcross'
import {
  BANK_PARCELS,
  HERON_POND,
  INNER_LOTS,
  KINGFISHER_CENTERLINE,
  MINK_CENTERLINE,
  MINK_POLYGON,
  NORTH_PARCELS,
  OSPREY_CENTERLINE,
  OSPREY_ROW,
  PARAMS,
  PARCEL_A,
  PARCEL_B,
  PARCEL_K,
  PARCEL_P,
  polar,
  rect,
} from '@/features/abutters/projection/testKit'
import type { CrossingFeature } from '@/features/abutters/projection/types'
import type { Pt } from '@/features/abutters/projection/vec'

const near = (actual: Pt, expected: Pt, tolerance = 0.01) => {
  expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1])).toBeLessThan(tolerance)
}

const sortedPoints = (points: { point: Pt }[]) =>
  points.map((p) => p.point).sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('projectAcross for A on Osprey Point Road', () => {
  it('A projects to (400, 25) and (800, 25) across the centerline', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_A],
      others: NORTH_PARCELS,
      features: [OSPREY_CENTERLINE],
      params: PARAMS,
    })
    const points = sortedPoints(result.points)
    expect(points).toHaveLength(2)
    near(points[0] as Pt, [400, 25])
    near(points[1] as Pt, [800, 25])
    expect(result.flags).toEqual([])
    expect(result.points.map((p) => p.hitParcelId).sort()).toEqual(['N2', 'N4'])
  })

  it('A projects to the same points across the right-of-way polygon', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_A],
      others: NORTH_PARCELS,
      features: [OSPREY_ROW],
      params: PARAMS,
    })
    const points = sortedPoints(result.points)
    expect(points).toHaveLength(2)
    near(points[0] as Pt, [400, 25])
    near(points[1] as Pt, [800, 25])
  })

  it('region for A spans x 400 to 800 and reaches y 30', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_A],
      others: NORTH_PARCELS,
      features: [OSPREY_CENTERLINE],
      params: PARAMS,
    })
    expect(result.regions).toHaveLength(1)
    const region = result.regions[0] as Pt[]
    const xs = region.map((p) => p[0])
    const ys = region.map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(400, 2)
    expect(Math.max(...xs)).toBeCloseTo(800, 2)
    expect(Math.max(...ys)).toBeCloseTo(30, 2)
  })

  it('a corner on the centerline projects along the side normal away from the applicant', () => {
    const touching = rect(400, 800, -325, 0)
    const result = projectAcross({
      applicantRings: [touching],
      others: NORTH_PARCELS,
      features: [OSPREY_CENTERLINE],
      params: PARAMS,
    })
    const points = sortedPoints(result.points)
    expect(points).toHaveLength(2)
    near(points[0] as Pt, [400, 25])
    near(result.points[0]?.direction as Pt, [0, 1])
  })

  it('foot at a path end produces no projection', () => {
    const outcome = projectCorner(
      [1520, -25],
      OSPREY_CENTERLINE,
      [1600, -150],
      NORTH_PARCELS,
      PARAMS,
    )
    expect(outcome).toBeNull()
  })

  it('a corner with nothing across is flagged no_property_across', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_A],
      others: [],
      features: [OSPREY_CENTERLINE],
      params: PARAMS,
    })
    expect(result.points).toEqual([])
    expect(result.flags.map((f) => f.kind)).toEqual(['no_property_across', 'no_property_across'])
    expect(result.regions).toEqual([])
  })
})

describe('projectAcross for B on Mink Brook', () => {
  it.each([
    ['stream polygon', MINK_POLYGON],
    ['stream centerline', MINK_CENTERLINE],
  ] as [
    string,
    CrossingFeature,
  ][])('B projects to (3030, -200) and (3030, 0) across the %s', (_name, feature) => {
    const result = projectAcross({
      applicantRings: [PARCEL_B],
      others: BANK_PARCELS,
      features: [feature],
      params: PARAMS,
    })
    const points = sortedPoints(result.points)
    expect(points).toHaveLength(2)
    near(points[0] as Pt, [3030, -200])
    near(points[1] as Pt, [3030, 0])
  })
})

describe('projectAcross for K on Kingfisher Bend', () => {
  it('K corners sit at 200 and 230 degrees on radius 525 and project to radius 475 within 0.5 ft', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_K],
      others: INNER_LOTS,
      features: [KINGFISHER_CENTERLINE],
      params: PARAMS,
    })
    expect(result.points).toHaveLength(2)
    const byAngle = result.points
      .map((p) => ({
        corner: p.corner,
        point: p.point,
        angle: (Math.atan2(p.corner[1], p.corner[0] - 7000) * 180) / Math.PI,
      }))
      .map((p) => ({ ...p, angle: p.angle < 0 ? p.angle + 360 : p.angle }))
      .sort((a, b) => a.angle - b.angle)
    near(byAngle[0]?.corner as Pt, polar(7000, 200, 525), 0.5)
    near(byAngle[1]?.corner as Pt, polar(7000, 230, 525), 0.5)
    near(byAngle[0]?.point as Pt, polar(7000, 200, 475), 0.5)
    near(byAngle[1]?.point as Pt, polar(7000, 230, 475), 0.5)
    expect(result.regions).toHaveLength(1)
  })
})

describe('projectAcross for P on Heron Pond', () => {
  it('P against Heron Pond flags crossing_too_wide', () => {
    const result = projectAcross({
      applicantRings: [PARCEL_P],
      others: [],
      features: [HERON_POND],
      params: PARAMS,
    })
    expect(result.points).toEqual([])
    expect(result.flags.map((f) => f.kind)).toEqual(['crossing_too_wide', 'crossing_too_wide'])
    expect(result.flags[0]?.featureId).toBe('heron')
  })
})

describe('prepared rings stay put', () => {
  it('preparing an already prepared ring changes nothing', () => {
    const once = prepareRing(PARCEL_A, PARAMS)
    expect(prepareRing([...once, once[0] as Pt], PARAMS)).toEqual(once)
  })
})
