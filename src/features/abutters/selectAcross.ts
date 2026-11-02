import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'
import type { CrossingFeature, ProjectionResult, Pt } from '@/features/abutters/projection/types'
import type { Candidate, CandidateReason } from '@/features/abutters/types'
import { isCaptured } from '@/features/abutters/verdicts'

const REGION_SHRINK_FT = -0.1
const CAPTURE_PREFILTER_MARGIN_FT = 1

function wkt(region: Pt[]): string {
  const ring = [...region, region[0] as Pt]
  return `POLYGON((${ring.map((p) => `${p[0]} ${p[1]}`).join(', ')}))`
}

export async function selectAcross(
  tx: DbOrTx,
  result: ProjectionResult,
  applicantParcelIds: string[],
  captureRadiusFt: number,
  features: CrossingFeature[],
  signal: AbortSignal,
): Promise<Candidate[]> {
  signal.throwIfAborted()
  const names = new Map(features.map((f) => [f.id, f.name]))
  const reasons = new Map<string, CandidateReason[]>()
  const add = (parcelId: string, reason: CandidateReason) => {
    const held = reasons.get(parcelId) ?? []
    if (!held.some((r) => JSON.stringify(r) === JSON.stringify(reason))) held.push(reason)
    reasons.set(parcelId, held)
  }
  const excluded = uuidArray(applicantParcelIds)
  for (const [index, region] of result.regions.entries()) {
    const featureId = result.regionFeatureIds[index] ?? ''
    const rows = await tx.execute<{ id: string }>(sql`
      select p.id from parcels p
      where p.geom is not null and p.status = 'active' and p.id <> all(${excluded})
        and ST_Intersects(
          ST_Transform(p.geom, 3437),
          ST_Buffer(ST_GeomFromText(${wkt(region)}, 3437), ${REGION_SHRINK_FT})
        )
      order by p.id
    `)
    for (const row of rows.rows) {
      add(row.id, {
        kind: 'across_between_points',
        featureId,
        featureName: names.get(featureId) ?? null,
      })
    }
  }
  for (const projected of result.points) {
    const rows = await tx.execute<{ id: string; feet: number }>(sql`
      select p.id, ST_Distance(
          ST_Transform(p.geom, 3437),
          ST_SetSRID(ST_MakePoint(${projected.point[0]}, ${projected.point[1]}), 3437)
        )::float8 as feet
      from parcels p
      where p.geom is not null and p.status = 'active' and p.id <> all(${excluded})
        and ST_DWithin(
          ST_Transform(p.geom, 3437),
          ST_SetSRID(ST_MakePoint(${projected.point[0]}, ${projected.point[1]}), 3437),
          ${captureRadiusFt + CAPTURE_PREFILTER_MARGIN_FT}
        )
      order by p.id
    `)
    for (const row of rows.rows) {
      if (!isCaptured(row.feet, captureRadiusFt)) continue
      add(row.id, {
        kind: 'across_within_capture',
        featureId: projected.featureId,
        distanceFt: Math.round(row.feet * 100) / 100,
      })
    }
  }
  return [...reasons.entries()].map(([parcelId, list]) => ({ parcelId, reasons: list }))
}
