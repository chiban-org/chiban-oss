import { add, cross, dist, dot, type Pt, scale, sub } from '@/features/abutters/projection/vec'

const EPSILON = 1e-9

export interface SegmentHit {
  point: Pt
  distance: number
  t: number
}

export function closestOnSegment(p: Pt, a: Pt, b: Pt): SegmentHit {
  const ab = sub(b, a)
  const lengthSquared = dot(ab, ab)
  const raw = lengthSquared === 0 ? 0 : dot(sub(p, a), ab) / lengthSquared
  const t = Math.min(1, Math.max(0, raw))
  const point = add(a, scale(ab, t))
  return { point, distance: dist(p, point), t: raw }
}

export function distanceToPath(p: Pt, path: Pt[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i + 1 < path.length; i += 1) {
    best = Math.min(best, closestOnSegment(p, path[i] as Pt, path[i + 1] as Pt).distance)
  }
  return best
}

export function distanceToRingBoundary(p: Pt, ring: Pt[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i + 1 < ring.length; i += 1) {
    best = Math.min(best, closestOnSegment(p, ring[i] as Pt, ring[i + 1] as Pt).distance)
  }
  return best
}

export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] as Pt
    const b = ring[j] as Pt
    const crosses = a[1] > p[1] !== b[1] > p[1]
    if (crosses && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function insideAny(p: Pt, rings: Pt[][]): boolean {
  return rings.some((ring) => pointInRing(p, ring))
}

export function rayHit(origin: Pt, direction: Pt, a: Pt, b: Pt): number | null {
  const edge = sub(b, a)
  const denominator = cross(direction, edge)
  if (Math.abs(denominator) < EPSILON) return null
  const toStart = sub(a, origin)
  const t = cross(toStart, edge) / denominator
  const s = cross(toStart, direction) / denominator
  if (t < -EPSILON || s < -EPSILON || s > 1 + EPSILON) return null
  return Math.max(0, t)
}

export function signedArea(ring: Pt[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i] as Pt
    const q = ring[(i + 1) % ring.length] as Pt
    area += p[0] * q[1] - q[0] * p[1]
  }
  return area / 2
}

export function polygonCentroid(ring: Pt[]): Pt {
  const area = signedArea(ring)
  if (Math.abs(area) < EPSILON) {
    const sum = ring.reduce<Pt>((acc, p) => add(acc, p), [0, 0])
    return scale(sum, 1 / Math.max(1, ring.length))
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i] as Pt
    const q = ring[(i + 1) % ring.length] as Pt
    const factor = p[0] * q[1] - q[0] * p[1]
    cx += (p[0] + q[0]) * factor
    cy += (p[1] + q[1]) * factor
  }
  return [cx / (6 * area), cy / (6 * area)]
}

function simplifyOpen(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points
  const first = points[0] as Pt
  const last = points[points.length - 1] as Pt
  let worst = -1
  let worstIndex = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = closestOnSegment(points[i] as Pt, first, last).distance
    if (d > worst) {
      worst = d
      worstIndex = i
    }
  }
  if (worst <= tolerance) return [first, last]
  const left = simplifyOpen(points.slice(0, worstIndex + 1), tolerance)
  const right = simplifyOpen(points.slice(worstIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

export function simplifyClosed(vertices: Pt[], tolerance: number): Pt[] {
  if (vertices.length < 4) return vertices
  const anchor = vertices[0] as Pt
  let farthest = 1
  for (let i = 1; i < vertices.length; i += 1) {
    if (dist(anchor, vertices[i] as Pt) > dist(anchor, vertices[farthest] as Pt)) farthest = i
  }
  const first = simplifyOpen(vertices.slice(0, farthest + 1), tolerance)
  const second = simplifyOpen([...vertices.slice(farthest), anchor], tolerance)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(sub(b, a), sub(c, a))
  const d2 = cross(sub(b, a), sub(d, a))
  const d3 = cross(sub(d, c), sub(a, c))
  const d4 = cross(sub(d, c), sub(b, c))
  return d1 * d2 < 0 && d3 * d4 < 0
}

export function selfIntersects(polygon: Pt[]): boolean {
  const n = polygon.length
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue
      const a = polygon[i] as Pt
      const b = polygon[(i + 1) % n] as Pt
      const c = polygon[j] as Pt
      const d = polygon[(j + 1) % n] as Pt
      if (segmentsCross(a, b, c, d)) return true
    }
  }
  return false
}

export function convexHull(points: Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const build = (list: Pt[]): Pt[] => {
    const hull: Pt[] = []
    for (const p of list) {
      while (hull.length >= 2) {
        const o = hull[hull.length - 2] as Pt
        const a = hull[hull.length - 1] as Pt
        if (cross(sub(a, o), sub(p, o)) > 0) break
        hull.pop()
      }
      hull.push(p)
    }
    hull.pop()
    return hull
  }
  return [...build(sorted), ...build([...sorted].reverse())]
}
