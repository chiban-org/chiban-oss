import { signedArea, simplifyClosed } from '@/features/abutters/projection/geom'
import type { ProjectionParams } from '@/features/abutters/projection/types'
import { type Pt, sub } from '@/features/abutters/projection/vec'

export interface FrontageRun {
  start: number
  end: number
}

export function prepareRing(
  ring: Pt[],
  params: Pick<ProjectionParams, 'simplifyToleranceFt'>,
): Pt[] {
  const first = ring[0]
  const last = ring[ring.length - 1]
  const open =
    first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
      ? ring.slice(0, -1)
      : ring
  const simplified = simplifyClosed(open, params.simplifyToleranceFt)
  return signedArea(simplified) < 0 ? [...simplified].reverse() : simplified
}

export function turnDegrees(before: Pt, at: Pt, after: Pt): number {
  const incoming = sub(at, before)
  const outgoing = sub(after, at)
  const angle = Math.atan2(
    incoming[0] * outgoing[1] - incoming[1] * outgoing[0],
    incoming[0] * outgoing[0] + incoming[1] * outgoing[1],
  )
  return Math.abs((angle * 180) / Math.PI)
}

function vertexAt(ring: Pt[], index: number): Pt {
  return ring[((index % ring.length) + ring.length) % ring.length] as Pt
}

function turnsAt(ring: Pt[], index: number, threshold: number): boolean {
  return (
    turnDegrees(vertexAt(ring, index - 1), vertexAt(ring, index), vertexAt(ring, index + 1)) >=
    threshold
  )
}

export function runVertexIndices(ring: Pt[], run: FrontageRun): number[] {
  const indices: number[] = []
  let index = run.start
  indices.push(index)
  while (index % ring.length !== run.end % ring.length) {
    index += 1
    indices.push(index)
  }
  return indices
}

export function findCorners(
  ring: Pt[],
  run: FrontageRun | null,
  params: Pick<ProjectionParams, 'cornerTurnDeg'>,
): Pt[] {
  if (run === null) {
    return ring.filter((_, i) => turnsAt(ring, i, params.cornerTurnDeg))
  }
  const indices = runVertexIndices(ring, run)
  const last = indices.length - 1
  return indices
    .filter(
      (index, position) =>
        position === 0 || position === last || turnsAt(ring, index, params.cornerTurnDeg),
    )
    .map((index) => vertexAt(ring, index))
}
