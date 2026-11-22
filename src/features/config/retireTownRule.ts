import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { configVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { isValidConfigKey } from '@/features/config/kinds'
import { lockConfigKey } from '@/features/config/store'
import { err, ok, type Result } from '@/types/result'

export async function retireTownRule(
  db: Db,
  actor: Actor,
  key: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_published'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  if (!isValidConfigKey(key)) return err('not_published')
  return await transactionResult(db, async (tx) => {
    await lockConfigKey(tx, 'town_rule_setting', key)
    const [published] = await tx
      .select()
      .from(configVersions)
      .where(
        and(
          eq(configVersions.kind, 'town_rule_setting'),
          eq(configVersions.key, key),
          eq(configVersions.status, 'published'),
        ),
      )
    if (published === undefined) return err('not_published')
    await tx
      .update(configVersions)
      .set({ status: 'superseded' })
      .where(eq(configVersions.id, published.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'config.retire_town_rule',
        entityType: 'config_version',
        entityId: published.id,
        before: {
          kind: 'town_rule_setting',
          key,
          version: published.version,
          body: published.body,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}
