import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, parcels, projectParties, projects } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { displayIdsFor } from '@/features/parcels/displayId'
import type { CivilDate } from '@/types/civilDate'

export interface ContractorProjectRow {
  projectId: string
  title: string
  parcelDisplayId: string | null
  siteAddress: HonestValue<string>
  applications: {
    applicationId: string
    number: string
    typeLabel: string
    state: CoreState
    issuedOn: CivilDate | null
  }[]
}

function decodeCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (cursor === undefined) return null
  const [at, id] = cursor.split('|')
  return at !== undefined && id !== undefined && !Number.isNaN(Date.parse(at)) ? { at, id } : null
}

export async function listContractorProjects(
  db: DbOrTx,
  actor: Actor,
  input: { limit: number; cursor?: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<{ rows: ContractorProjectRow[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  const after = decodeCursor(input.cursor)
  const rows = await db
    .selectDistinct({
      projectId: projects.id,
      title: projects.title,
      createdAt: projects.createdAt,
      parcelId: projects.parcelId,
      siteAddress: parcels.siteAddress,
    })
    .from(projects)
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .innerJoin(
      projectParties,
      and(
        eq(projectParties.projectId, projects.id),
        eq(projectParties.userId, actor.userId),
        eq(projectParties.role, 'contractor'),
        isNull(projectParties.removedAt),
      ),
    )
    .where(
      after === null
        ? undefined
        : sql`(${projects.createdAt}, ${projects.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`,
    )
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const projectIds = page.map((r) => r.projectId)
  const apps =
    projectIds.length === 0
      ? []
      : await db.select().from(applications).where(inArray(applications.projectId, projectIds))
  const display = await displayIdsFor(db, [...new Set(page.map((r) => r.parcelId))])
  const layer = await getLayerStatus(db, 'parcels', now, signal)
  const labels = new Map<string, string>()
  for (const app of apps) {
    const pins = app.configPins as { applicationType: string }
    if (labels.has(pins.applicationType)) continue
    const type = await getVersion(db, pins.applicationType, signal)
    labels.set(
      pins.applicationType,
      (type?.body as ApplicationTypeBody | undefined)?.label ?? app.applicationTypeKey,
    )
  }
  const last = page.at(-1)
  return {
    rows: page.map((r) => ({
      projectId: r.projectId,
      title: r.title,
      parcelDisplayId: display.get(r.parcelId) ?? null,
      siteAddress: honestFromLayer(layer, r.siteAddress),
      applications: apps
        .filter((a) => a.projectId === r.projectId)
        .map((a) => ({
          applicationId: a.id,
          number: a.number,
          typeLabel:
            labels.get((a.configPins as { applicationType: string }).applicationType) ??
            a.applicationTypeKey,
          state: a.state as CoreState,
          issuedOn: a.issuedOn as CivilDate | null,
        })),
    })),
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? `${last.createdAt.toISOString()}|${last.projectId}`
        : null,
  }
}
