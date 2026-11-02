import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { LAYER_ADAPTERS, LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { featureMappingSchema, layerMappingSchema } from '@/features/gis/layerMapping'
import { err, ok, type Result } from '@/types/result'

const MAX_STALE_DAYS = 3650
const MAX_REFRESH_HOURS = 720

const schema = z.object({
  key: z.enum(LAYER_KEYS),
  adapter: z.enum(LAYER_ADAPTERS).nullable(),
  sourceUrl: z.url().nullable(),
  mapping: z.string(),
  staleAfterDays: z.number().int().min(1).max(MAX_STALE_DAYS),
  refreshIntervalHours: z.number().int().min(1).max(MAX_REFRESH_HOURS),
})

export type LayerSettingsInput = z.input<typeof schema>
export type LayerSettingsError = 'forbidden' | 'invalid_settings' | 'invalid_mapping'

export async function updateLayerSettings(
  db: Db,
  actor: Actor,
  input: LayerSettingsInput,
  signal: AbortSignal,
): Promise<Result<void, LayerSettingsError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return err('invalid_settings')
  let mapping: unknown
  try {
    mapping = JSON.parse(parsed.data.mapping === '' ? '{}' : parsed.data.mapping)
  } catch {
    return err('invalid_mapping')
  }
  const mappingSchema = parsed.data.key === 'parcels' ? layerMappingSchema : featureMappingSchema
  const checked = mappingSchema.safeParse(mapping)
  if (!checked.success) return err('invalid_mapping')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(gisLayers).where(eq(gisLayers.key, parsed.data.key))
    await tx
      .update(gisLayers)
      .set({
        adapter: parsed.data.adapter,
        sourceUrl: parsed.data.sourceUrl,
        mapping: checked.data,
        staleAfterDays: parsed.data.staleAfterDays,
        refreshIntervalHours: parsed.data.refreshIntervalHours,
      })
      .where(eq(gisLayers.key, parsed.data.key))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'gis_layer.update_settings',
        entityType: 'gis_layer',
        entityId: parsed.data.key,
        before: before ?? null,
        after: parsed.data,
      },
      signal,
    )
  })
  return ok(undefined)
}
