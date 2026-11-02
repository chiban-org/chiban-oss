import type { FrontageRun } from '@/features/abutters/projection/corners'
import {
  closestOnSegment,
  distanceToPath,
  distanceToRingBoundary,
} from '@/features/abutters/projection/geom'
import type { CrossingFeature, ProjectionParams } from '@/features/abutters/projection/types'
import { dot, type Pt, sub, unit } from '@/features/abutters/projection/vec'

function nearestSegmentDirection(paths: Pt[][], p: Pt): Pt {
  let best = Number.POSITIVE_INFINITY
  let direction: Pt = [1, 0]
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i += 1) {
      const a = path[i] as Pt
      const b = path[i + 1] as Pt
      const d = closestOnSegment(p, a, b).distance
      if (d < best) {
        best = d
        direction = unit(sub(b, a))
      }
    }
  }
  return direction
}

function parallelEnough(a: Pt, b: Pt, c: Pt[][], toleranceDeg: number): boolean {
  const midpoint: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const edge = unit(sub(b, a))
  const feature = nearestSegmentDirection(c, midpoint)
  const cosine = Math.min(1, Math.abs(dot(edge, feature)))
  return (Math.acos(cosine) * 180) / Math.PI <= toleranceDeg
}

function edgeFaces(a: Pt, b: Pt, feature: CrossingFeature, params: ProjectionParams): boolean {
  if (feature.geometry.kind === 'line') {
    const { paths } = feature.geometry
    const near = (p: Pt) =>
      Math.min(...paths.map((path) => distanceToPath(p, path))) <= params.lineFrontageToleranceFt
    return near(a) && near(b) && parallelEnough(a, b, paths, params.parallelToleranceDeg)
  }
  const { rings } = feature.geometry
  const near = (p: Pt) =>
    Math.min(...rings.map((ring) => distanceToRingBoundary(p, ring))) <=
    params.areaFrontageToleranceFt
  return near(a) && near(b)
}

export function frontageRuns(
  ring: Pt[],
  feature: CrossingFeature,
  params: ProjectionParams,
): (FrontageRun | null)[] {
  const n = ring.length
  const facing = ring.map((a, i) => edgeFaces(a, ring[(i + 1) % n] as Pt, feature, params))
  if (facing.every(Boolean)) return [null]
  const runs: FrontageRun[] = []
  for (let i = 0; i < n; i += 1) {
    if (!facing[i] || facing[(i + n - 1) % n]) continue
    let length = 0
    while (facing[(i + length) % n]) length += 1
    runs.push({ start: i, end: (i + length) % n })
  }
  return runs
}
