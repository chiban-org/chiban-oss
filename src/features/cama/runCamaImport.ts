import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type CamaMapping, camaMappingSchema } from '@/features/cama/mapping'
import { type CamaReadError, readCamaCsv } from '@/features/cama/readCamaCsv'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import { runImport } from '@/features/gis/import/runImport'
import type { ImportError, ImportRunReport } from '@/features/gis/import/types'
import { err, ok, type Result } from '@/types/result'

export interface CamaImportInput {
  bytes: Uint8Array
  fullLayer: boolean
  mapping?: unknown
}

async function mappingForRun(
  db: Db,
  onScreen: unknown,
): Promise<Result<CamaMapping, 'invalid_mapping' | 'layer_not_configured'>> {
  const [layer] = await db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
  if (layer === undefined) return err('layer_not_configured')
  const parsed = camaMappingSchema.safeParse(onScreen === undefined ? layer.mapping : onScreen)
  return parsed.success ? ok(parsed.data) : err('invalid_mapping')
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
  const mapping = await mappingForRun(db, input.mapping)
  if (!mapping.ok) return mapping
  const read = readCamaCsv(input.bytes, mapping.value)
  if (!read.ok) return err(read.error)
  if (input.mapping !== undefined) {
    const saved = await saveCamaMapping(db, actor, mapping.value, signal)
    if (!saved.ok) return saved
  }
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
