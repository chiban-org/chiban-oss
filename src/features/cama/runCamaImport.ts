import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { camaMappingSchema } from '@/features/cama/mapping'
import { type CamaReadError, readCamaCsv } from '@/features/cama/readCamaCsv'
import { runImport } from '@/features/gis/import/runImport'
import type { ImportError, ImportRunReport } from '@/features/gis/import/types'
import { err, type Result } from '@/types/result'

export interface CamaImportInput {
  bytes: Uint8Array
  fullLayer: boolean
}

export async function runCamaImport(
  db: Db,
  actor: Actor,
  input: CamaImportInput,
  signal: AbortSignal,
): Promise<Result<ImportRunReport, ImportError | CamaReadError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'gis.import', signal)
  if (!allowed.ok) return err('forbidden')
  const [layer] = await db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
  if (layer === undefined) return err('layer_not_configured')
  const mapping = camaMappingSchema.safeParse(layer.mapping)
  if (!mapping.success) return err('invalid_mapping')
  const read = readCamaCsv(input.bytes, mapping.data)
  if (!read.ok) return err(read.error)
  return await runImport(
    db,
    { kind: 'user', userId: actor.userId },
    {
      layerKey: 'cama',
      adapter: 'file_cama_csv',
      features: read.value,
      fullLayer: input.fullLayer,
    },
    signal,
  )
}
