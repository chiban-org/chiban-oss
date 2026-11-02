import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type CamaMapping, camaMappingSchema } from '@/features/cama/mapping'
import { err, ok, type Result } from '@/types/result'

export type SaveCamaMappingError = 'forbidden' | 'invalid_mapping'

export async function saveCamaMapping(
  db: Db,
  actor: Actor,
  input: unknown,
  signal: AbortSignal,
): Promise<Result<CamaMapping, SaveCamaMappingError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'gis.import', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = camaMappingSchema.safeParse(input)
  if (!parsed.success) return err('invalid_mapping')
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
    await tx
      .update(gisLayers)
      .set({ adapter: 'file_cama_csv', mapping: parsed.data })
      .where(eq(gisLayers.key, 'cama'))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'gis_layer.update_settings',
        entityType: 'gis_layer',
        entityId: 'cama',
        before: before ?? null,
        after: { adapter: 'file_cama_csv', mapping: parsed.data },
      },
      signal,
    )
  })
  return ok(parsed.data)
}
