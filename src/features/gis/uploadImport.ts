import { z } from 'zod'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { GEOMETRY_LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { runImport } from '@/features/gis/import/runImport'
import type { SourceFeature } from '@/features/gis/import/types'
import { readGeoJson } from '@/features/gis/readers/geojson'
import { readGeoPackage } from '@/features/gis/readers/geopackage'
import { readShapefileZip } from '@/features/gis/readers/shapefile'
import type { ReaderError } from '@/features/gis/readers/types'
import type { Result } from '@/types/result'

export const UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

const FILE_ADAPTERS = ['file_geojson', 'file_shapefile', 'file_geopackage'] as const

const fieldsSchema = z.object({
  layerKey: z.enum(GEOMETRY_LAYER_KEYS),
  adapter: z.enum(FILE_ADAPTERS),
  table: z.string().min(1).optional(),
})

export interface UploadResponse {
  status: number
  body: Record<string, unknown>
}

async function readerFor(
  adapter: (typeof FILE_ADAPTERS)[number],
  bytes: Uint8Array,
  table: string | undefined,
  signal: AbortSignal,
): Promise<Result<SourceFeature[], ReaderError>> {
  if (adapter === 'file_geojson') return await readGeoJson(bytes, signal)
  if (adapter === 'file_shapefile') return await readShapefileZip(bytes, signal)
  return await readGeoPackage(bytes, signal, table === undefined ? {} : { table })
}

const IMPORT_ERROR_STATUS = {
  forbidden: 403,
  import_in_progress: 409,
  layer_not_configured: 400,
  invalid_mapping: 400,
  import_failed: 500,
} as const

export async function processUpload(
  db: Db,
  actor: Actor,
  form: FormData,
  signal: AbortSignal,
): Promise<UploadResponse> {
  const fields = fieldsSchema.safeParse({
    layerKey: form.get('layerKey'),
    adapter: form.get('adapter'),
    table: form.get('table') ?? undefined,
  })
  const file = form.get('file')
  if (!fields.success || !(file instanceof File)) {
    return { status: 400, body: { error: 'bad_request' } }
  }
  if (file.size === 0) return { status: 400, body: { error: 'empty' } }
  if (file.size > UPLOAD_LIMIT_BYTES) return { status: 413, body: { error: 'too_large' } }
  const read = await readerFor(
    fields.data.adapter,
    new Uint8Array(await file.arrayBuffer()),
    fields.data.table,
    signal,
  )
  if (!read.ok) return { status: 400, body: { error: 'reader', ...read.error } }
  const result = await runImport(
    db,
    { kind: 'user', userId: actor.userId },
    {
      layerKey: fields.data.layerKey,
      adapter: fields.data.adapter,
      features: read.value,
      fullLayer: true,
    },
    signal,
  )
  if (!result.ok)
    return { status: IMPORT_ERROR_STATUS[result.error], body: { error: result.error } }
  return { status: 200, body: { runId: result.value.runId } }
}
