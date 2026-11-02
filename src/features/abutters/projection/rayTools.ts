import { closestOnSegment, insideAny, rayHit } from '@/features/abutters/projection/geom'
import type { OtherParcel } from '@/features/abutters/projection/types'
import { add, leftNormal, type Pt, scale, sub, unit } from '@/features/abutters/projection/vec'

const PROBE_FT = 0.01
const EXIT_PROBE_FT = 1e-4
const SAME_POINT_FT = 1e-9

export interface PathFoot {
  point: Pt
  segmentDirection: Pt
  atPathEnd: boolean
}

function sharesEndpoint(paths: Pt[][], owner: Pt[], end: Pt): boolean {
  return paths.some(
    (other) =>
      other !== owner &&
      [other[0], other[other.length - 1]].some(
        (o) => o !== undefined && Math.hypot(o[0] - end[0], o[1] - end[1]) <= SAME_POINT_FT,
      ),
  )
}

export function closestPointOnPaths(paths: Pt[][], c: Pt): PathFoot {
  let best = Number.POSITIVE_INFINITY
  let foot: PathFoot = { point: c, segmentDirection: [1, 0], atPathEnd: false }
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i += 1) {
      const a = path[i] as Pt
      const b = path[i + 1] as Pt
      const hit = closestOnSegment(c, a, b)
      if (hit.distance >= best) continue
      best = hit.distance
      const first = path[0] as Pt
      const last = path[path.length - 1] as Pt
      const atEnd = [first, last].some(
        (end) =>
          Math.hypot(hit.point[0] - end[0], hit.point[1] - end[1]) <= SAME_POINT_FT &&
          !sharesEndpoint(paths, path, end),
      )
      foot = { point: hit.point, segmentDirection: unit(sub(b, a)), atPathEnd: atEnd }
    }
  }
  return foot
}

export interface Edge {
  a: Pt
  b: Pt
}

export function nearestEdge(rings: Pt[][], c: Pt): Edge {
  let best = Number.POSITIVE_INFINITY
  let edge: Edge = { a: c, b: c }
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i += 1) {
      const a = ring[i] as Pt
      const b = ring[i + 1] as Pt
      const d = closestOnSegment(c, a, b).distance
      if (d < best) {
        best = d
        edge = { a, b }
      }
    }
  }
  return edge
}

export function inwardNormal(edge: Edge, rings: Pt[][]): Pt {
  const normal = leftNormal(sub(edge.b, edge.a))
  const midpoint: Pt = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2]
  return insideAny(add(midpoint, scale(normal, PROBE_FT)), rings) ? normal : scale(normal, -1)
}

function edgesOf(rings: Pt[][]): [Pt, Pt][] {
  return rings.flatMap((ring) =>
    ring.slice(0, -1).map((p, i) => [p, ring[i + 1] as Pt] as [Pt, Pt]),
  )
}

export function firstExitDistance(c: Pt, u: Pt, rings: Pt[][]): number {
  const ts = edgesOf(rings)
    .map(([a, b]) => rayHit(c, u, a, b))
    .filter((t): t is number => t !== null && t > EXIT_PROBE_FT)
    .sort((x, y) => x - y)
  for (const t of ts) {
    if (!insideAny(add(c, scale(u, t + EXIT_PROBE_FT)), rings)) return t
  }
  return Number.POSITIVE_INFINITY
}

export function firstBoundaryHit(
  c: Pt,
  u: Pt,
  others: OtherParcel[],
  crossingStart: number,
  maxCrossingFt: number,
): { point: Pt; parcelId: string } | null {
  let best: { t: number; parcelId: string } | null = null
  for (const other of others) {
    for (const [a, b] of edgesOf(other.rings)) {
      const t = rayHit(c, u, a, b)
      if (t === null || t < crossingStart || t > maxCrossingFt) continue
      if (best === null || t < best.t) best = { t, parcelId: other.parcelId }
    }
  }
  return best === null ? null : { point: add(c, scale(u, best.t)), parcelId: best.parcelId }
}
