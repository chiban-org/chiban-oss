import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { configVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  CONFIG_KEY_ISSUE,
  CONFIG_SCHEMAS,
  type ConfigIssue,
  type ConfigKind,
  isValidConfigKey,
} from '@/features/config/kinds'
import { err, ok, type Result } from '@/types/result'

export type ConfigVersionRow = typeof configVersions.$inferSelect

export function validateBody(
  kind: ConfigKind,
  body: unknown,
): { ok: true; body: unknown } | { ok: false; issues: ConfigIssue[] } {
  const parsed = CONFIG_SCHEMAS[kind].safeParse(body)
  if (parsed.success) return { ok: true, body: parsed.data }
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  }
}

export async function lockConfigKey(tx: Tx, kind: ConfigKind, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`config:${kind}:${key}`}))`)
}

export async function nextVersionNumber(tx: Tx, kind: ConfigKind, key: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${configVersions.version}), 0)` })
    .from(configVersions)
    .where(and(eq(configVersions.kind, kind), eq(configVersions.key, key)))
  return (row?.max ?? 0) + 1
}

export async function saveDraft(
  db: Db,
  actor: Actor,
  input: { kind: ConfigKind; key: string; body: unknown },
  signal: AbortSignal,
): Promise<Result<{ versionId: string }, 'forbidden' | { invalid: ConfigIssue[] }>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  if (!isValidConfigKey(input.key)) return err({ invalid: [CONFIG_KEY_ISSUE] })
  const checked = validateBody(input.kind, input.body)
  if (!checked.ok) return err({ invalid: checked.issues })
  return await transactionResult(db, async (tx) => {
    await lockConfigKey(tx, input.kind, input.key)
    const [draft] = await tx
      .select()
      .from(configVersions)
      .where(
        and(
          eq(configVersions.kind, input.kind),
          eq(configVersions.key, input.key),
          eq(configVersions.status, 'draft'),
        ),
      )
    let versionId = draft?.id ?? ''
    if (draft === undefined) {
      const version = await nextVersionNumber(tx, input.kind, input.key)
      const [created] = await tx
        .insert(configVersions)
        .values({
          kind: input.kind,
          key: input.key,
          version,
          status: 'draft',
          body: checked.body,
          createdBy: actor.userId,
        })
        .returning({ id: configVersions.id })
      versionId = created?.id ?? ''
    } else {
      await tx
        .update(configVersions)
        .set({ body: checked.body })
        .where(eq(configVersions.id, draft.id))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'config.save_draft',
        entityType: 'config_version',
        entityId: versionId,
        after: { kind: input.kind, key: input.key },
      },
      signal,
    )
    return ok({ versionId })
  })
}

export async function getVersion(
  db: DbOrTx,
  versionId: string,
  signal: AbortSignal,
): Promise<ConfigVersionRow | null> {
  signal.throwIfAborted()
  const [row] = await db.select().from(configVersions).where(eq(configVersions.id, versionId))
  return row ?? null
}

export async function getPublished(
  db: DbOrTx,
  kind: ConfigKind,
  key: string,
  signal: AbortSignal,
): Promise<ConfigVersionRow | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select()
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, kind),
        eq(configVersions.key, key),
        eq(configVersions.status, 'published'),
      ),
    )
  return row ?? null
}

export async function listVersions(
  db: DbOrTx,
  kind: ConfigKind,
  key: string,
  signal: AbortSignal,
): Promise<ConfigVersionRow[]> {
  signal.throwIfAborted()
  return await db
    .select()
    .from(configVersions)
    .where(and(eq(configVersions.kind, kind), eq(configVersions.key, key)))
    .orderBy(desc(configVersions.version))
}
