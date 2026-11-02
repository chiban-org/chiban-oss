import { type FrontageRun, findCorners, prepareRing } from '@/features/abutters/projection/corners'
import { frontageRuns } from '@/features/abutters/projection/frontage'
import { convexHull, polygonCentroid, selfIntersects } from '@/features/abutters/projection/geom'
import {
  closestPointOnPaths,
  firstBoundaryHit,
  firstExitDistance,
  inwardNormal,
  nearestEdge,
} from '@/features/abutters/projection/rayTools'
import type {
  CrossingFeature,
  OtherParcel,
  ProjectedPoint,
  ProjectionFlag,
  ProjectionParams,
  ProjectionResult,
} from '@/features/abutters/projection/types'
import {
  add,
  dist,
  dot,
  leftNormal,
  type Pt,
  scale,
  sub,
  unit,
} from '@/features/abutters/projection/vec'

export function projectCorner(
  c: Pt,
  f: CrossingFeature,
  centroid: Pt,
  others: OtherParcel[],
  p: ProjectionParams,
): ProjectedPoint | ProjectionFlag | null {
  let u: Pt
  let crossingStart: number
  if (f.geometry.kind === 'line') {
    const foot = closestPointOnPaths(f.geometry.paths, c)
    if (foot.atPathEnd) return null
    const d = dist(c, foot.point)
    if (d >= p.onFeatureToleranceFt) {
      u = unit(sub(foot.point, c))
      crossingStart = d
    } else {
      const n = leftNormal(foot.segmentDirection)
      u = dot(n, sub(centroid, foot.point)) > 0 ? scale(n, -1) : n
      crossingStart = 0
    }
  } else {
    const edge = nearestEdge(f.geometry.rings, c)
    u = inwardNormal(edge, f.geometry.rings)
    const exit = firstExitDistance(c, u, f.geometry.rings)
    if (exit > p.maxCrossingFt) return { kind: 'crossing_too_wide', featureId: f.id, corner: c }
    crossingStart = exit / 2
  }
  const hit = firstBoundaryHit(c, u, others, crossingStart, p.maxCrossingFt)
  if (hit === null) return { kind: 'no_property_across', featureId: f.id, corner: c }
  return { featureId: f.id, corner: c, point: hit.point, direction: u, hitParcelId: hit.parcelId }
}

function isPoint(outcome: ProjectedPoint | ProjectionFlag | null): outcome is ProjectedPoint {
  return outcome !== null && 'point' in outcome
}

function regionBetween(first: ProjectedPoint, second: ProjectedPoint, depthFt: number): Pt[] {
  const polygon: Pt[] = [
    first.corner,
    second.corner,
    add(second.point, scale(second.direction, depthFt)),
    add(first.point, scale(first.direction, depthFt)),
  ]
  return selfIntersects(polygon) ? convexHull(polygon) : polygon
}

function projectRun(
  ring: Pt[],
  run: FrontageRun | null,
  feature: CrossingFeature,
  others: OtherParcel[],
  params: ProjectionParams,
): ProjectionResult {
  const centroid = polygonCentroid(ring)
  const corners = findCorners(ring, run, params)
  const outcomes = corners.map((corner) => projectCorner(corner, feature, centroid, others, params))
  const result: ProjectionResult = { points: [], regions: [], flags: [], regionFeatureIds: [] }
  for (const outcome of outcomes) {
    if (outcome === null) continue
    if (isPoint(outcome)) result.points.push(outcome)
    else result.flags.push(outcome)
  }
  const pairs = run === null ? outcomes.length : outcomes.length - 1
  for (let i = 0; i < pairs; i += 1) {
    const first = outcomes[i]
    const second = outcomes[(i + 1) % outcomes.length]
    if (isPoint(first ?? null) && isPoint(second ?? null)) {
      result.regions.push(
        regionBetween(first as ProjectedPoint, second as ProjectedPoint, params.alongDepthFt),
      )
      result.regionFeatureIds.push(feature.id)
    }
  }
  return result
}

export function projectAcross(input: {
  applicantRings: Pt[][]
  others: OtherParcel[]
  features: CrossingFeature[]
  params: ProjectionParams
}): ProjectionResult {
  const total: ProjectionResult = { points: [], regions: [], flags: [], regionFeatureIds: [] }
  for (const raw of input.applicantRings) {
    const ring = prepareRing(raw, input.params)
    for (const feature of input.features) {
      for (const run of frontageRuns(ring, feature, input.params)) {
        const part = projectRun(ring, run, feature, input.others, input.params)
        total.points.push(...part.points)
        total.regions.push(...part.regions)
        total.regionFeatureIds.push(...part.regionFeatureIds)
        total.flags.push(...part.flags)
      }
    }
  }
  return total
}
