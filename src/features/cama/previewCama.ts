import type { Db } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type CamaMapping, camaMappingSchema } from '@/features/cama/mapping'
import { type CamaReadError, parseCamaFile, toSourceFeature } from '@/features/cama/readCamaCsv'
import { checkIdFormat, type IdFormat } from '@/features/parcels/idFormats'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { err, ok, type Result } from '@/types/result'

const PREVIEW_ROWS = 10

export type CamaRowStatus = 'resolves' | 'unknown' | 'retired' | 'invalid'

export interface CamaPreviewRow {
  line: number
  id: string | null
  status: CamaRowStatus
  ownerName: string | null
  mailingAddress: string | null
  siteAddress: string | null
}

export interface CamaPreview {
  headers: string[]
  totalRows: number
  rows: CamaPreviewRow[]
}

async function statusOf(
  db: Db,
  formatKey: string,
  format: IdFormat | undefined,
  id: string | null,
  signal: AbortSignal,
): Promise<CamaRowStatus> {
  if (id === null || format === undefined || !checkIdFormat(format, id).ok) return 'invalid'
  const found = await resolveParcelId(db, { format: formatKey, value: id }, signal)
  if (!found.ok) return found.error === 'not_found' ? 'unknown' : 'invalid'
  return found.value.via === 'retired' ? 'retired' : 'resolves'
}

async function loadFormat(db: Db, key: string): Promise<IdFormat | undefined> {
  const rows = await db.select().from(parcelIdFormats)
  const row = rows.find((r) => r.key === key)
  return row === undefined ? undefined : { key: row.key, kind: row.kind, width: row.width }
}

export async function previewCama(
  db: Db,
  bytes: Uint8Array,
  mapping: CamaMapping,
  signal: AbortSignal,
): Promise<Result<CamaPreview, CamaReadError>> {
  signal.throwIfAborted()
  const file = parseCamaFile(bytes, mapping)
  if (!file.ok) return file
  const format = await loadFormat(db, mapping.id.format)
  const rows: CamaPreviewRow[] = []
  for (const [index, cells] of file.value.records.slice(0, PREVIEW_ROWS).entries()) {
    const feature = toSourceFeature(cells, mapping, index)
    const rawId = feature.properties.id
    const id = typeof rawId === 'string' ? rawId : null
    rows.push({
      line: index + 2,
      id,
      status: await statusOf(db, mapping.id.format, format, id, signal),
      ownerName: textOrNull(feature.properties.ownerName),
      mailingAddress: textOrNull(feature.properties.mailingAddress),
      siteAddress: textOrNull(feature.properties.siteAddress),
    })
  }
  return ok({ headers: file.value.headers, totalRows: file.value.records.length, rows })
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export async function previewCamaFile(
  db: Db,
  actor: Actor,
  input: { bytes: Uint8Array; mapping: unknown },
  signal: AbortSignal,
): Promise<Result<CamaPreview, 'forbidden' | 'invalid_mapping' | CamaReadError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'gis.import', signal)
  if (!allowed.ok) return err('forbidden')
  const mapping = camaMappingSchema.safeParse(input.mapping)
  if (!mapping.success) return err('invalid_mapping')
  return await previewCama(db, input.bytes, mapping.data, signal)
}
