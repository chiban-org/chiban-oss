import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, parcels, projects } from '@/db/schema'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { displayIdsFor } from '@/features/parcels/displayId'

export interface SiteInfo {
  applicationNumber: string
  parcelId: string
  parcelDisplayId: string | null
  siteAddress: HonestValue<string>
}

export function inspectionTypeLabel(inspectionType: string): string {
  const spaced = inspectionType.replace(/[_-]+/g, ' ').trim()
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
}

export async function loadSiteInfo(
  db: DbOrTx,
  applicationId: string,
  now: Date,
  signal: AbortSignal,
): Promise<SiteInfo | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      number: applications.number,
      parcelId: projects.parcelId,
      siteAddress: parcels.siteAddress,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .where(eq(applications.id, applicationId))
  if (row === undefined) return null
  const layer = await getLayerStatus(db, 'parcels', now, signal)
  const display = await displayIdsFor(db, [row.parcelId])
  return {
    applicationNumber: row.number,
    parcelId: row.parcelId,
    parcelDisplayId: display.get(row.parcelId) ?? null,
    siteAddress: honestFromLayer(layer, row.siteAddress),
  }
}
