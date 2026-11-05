import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { configVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type ConfigKind, isValidConfigKey } from '@/features/config/kinds'
import { lockConfigKey } from '@/features/config/store'
import { err, ok, type Result } from '@/types/result'

export async function discardDraft(
  db: Db,
  actor: Actor,
  input: { kind: ConfigKind; key: string },
  signal: AbortSignal,
): Promise<Result<{ remaining: number }, 'forbidden' | 'no_draft'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  if (!isValidConfigKey(input.key)) return err('no_draft')
  return await transactionResult(db, async (tx) => {
    await lockConfigKey(tx, input.kind, input.key)
    const rows = await tx
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.kind, input.kind), eq(configVersions.key, input.key)))
    const draft = rows.find((row) => row.status === 'draft')
    if (draft === undefined) return err('no_draft')
    await tx.delete(configVersions).where(eq(configVersions.id, draft.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'config.discard_draft',
        entityType: 'config_version',
        entityId: draft.id,
        before: { kind: input.kind, key: input.key, version: draft.version },
      },
      signal,
    )
    return ok({ remaining: rows.length - 1 })
  })
}
