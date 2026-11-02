import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { configVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { CONFIG_KEY_ISSUE, type ConfigKind, isValidConfigKey } from '@/features/config/kinds'
import { type PublishError, runPublishChecks } from '@/features/config/publishChecks'
import { lockConfigKey, nextVersionNumber, validateBody } from '@/features/config/store'
import { err, ok, type Result } from '@/types/result'

export type { PublishError } from '@/features/config/publishChecks'

type VersionRow = typeof configVersions.$inferSelect

async function publishRow(
  tx: Tx,
  actor: Actor,
  row: VersionRow,
  action: 'config.publish' | 'config.rollback',
  signal: AbortSignal,
): Promise<Result<{ version: number }, PublishError>> {
  const kind = row.kind as ConfigKind
  const checked = validateBody(kind, row.body)
  if (!checked.ok) return err({ invalid: checked.issues })
  const failure = await runPublishChecks(tx, kind, row.key, checked.body, signal)
  if (failure !== null) return err(failure)
  const [previous] = await tx
    .select()
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, row.kind),
        eq(configVersions.key, row.key),
        eq(configVersions.status, 'published'),
      ),
    )
  if (previous !== undefined) {
    await tx
      .update(configVersions)
      .set({ status: 'superseded' })
      .where(eq(configVersions.id, previous.id))
  }
  await tx
    .update(configVersions)
    .set({ status: 'published', publishedBy: actor.userId, publishedAt: new Date() })
    .where(eq(configVersions.id, row.id))
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action,
      entityType: 'config_version',
      entityId: row.id,
      before: previous === undefined ? null : { version: previous.version, id: previous.id },
      after: {
        version: row.version,
        kind: row.kind,
        key: row.key,
        rolledBackFrom: row.rolledBackFrom,
      },
    },
    signal,
  )
  return ok({ version: row.version })
}

export async function publishConfig(
  db: Db,
  actor: Actor,
  versionId: string,
  signal: AbortSignal,
): Promise<Result<{ version: number }, PublishError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [peek] = await tx.select().from(configVersions).where(eq(configVersions.id, versionId))
    if (peek === undefined) return err('not_draft')
    await lockConfigKey(tx, peek.kind as ConfigKind, peek.key)
    const [row] = await tx.select().from(configVersions).where(eq(configVersions.id, versionId))
    if (row?.status !== 'draft') return err('not_draft')
    if (!isValidConfigKey(row.key)) return err({ invalid: [CONFIG_KEY_ISSUE] })
    return await publishRow(tx, actor, row, 'config.publish', signal)
  })
}

export interface NewVersionInput {
  kind: ConfigKind
  key: string
  body: unknown
  rolledBackFrom?: number
  upstream?: { id: string; version: number }
}

export async function publishNewVersion(
  tx: Tx,
  actor: Actor,
  input: NewVersionInput,
  action: 'config.publish' | 'config.rollback',
  signal: AbortSignal,
): Promise<Result<{ version: number; versionId: string }, PublishError>> {
  await lockConfigKey(tx, input.kind, input.key)
  await tx
    .delete(configVersions)
    .where(
      and(
        eq(configVersions.kind, input.kind),
        eq(configVersions.key, input.key),
        eq(configVersions.status, 'draft'),
      ),
    )
  const version = await nextVersionNumber(tx, input.kind, input.key)
  const [created] = await tx
    .insert(configVersions)
    .values({
      kind: input.kind,
      key: input.key,
      version,
      status: 'draft',
      body: input.body,
      rolledBackFrom: input.rolledBackFrom ?? null,
      upstreamTemplateId: input.upstream?.id ?? null,
      upstreamTemplateVersion: input.upstream?.version ?? null,
      createdBy: actor.userId,
    })
    .returning()
  if (created === undefined) return err({ invalid: [{ path: '', message: 'insert failed' }] })
  const published = await publishRow(tx, actor, created, action, signal)
  return published.ok ? ok({ version: published.value.version, versionId: created.id }) : published
}

export async function rollbackConfig(
  db: Db,
  actor: Actor,
  input: { kind: ConfigKind; key: string; toVersion: number },
  signal: AbortSignal,
): Promise<Result<{ version: number }, PublishError | 'no_such_version'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<{ version: number }, PublishError | 'no_such_version'>(
    db,
    async (tx) => {
      const [old] = await tx
        .select()
        .from(configVersions)
        .where(
          and(
            eq(configVersions.kind, input.kind),
            eq(configVersions.key, input.key),
            eq(configVersions.version, input.toVersion),
          ),
        )
      if (old === undefined) return err('no_such_version')
      const result = await publishNewVersion(
        tx,
        actor,
        {
          kind: input.kind,
          key: input.key,
          body: old.body,
          rolledBackFrom: old.version,
          upstream:
            old.upstreamTemplateId === null || old.upstreamTemplateVersion === null
              ? undefined
              : { id: old.upstreamTemplateId, version: old.upstreamTemplateVersion },
        },
        'config.rollback',
        signal,
      )
      return result.ok ? ok({ version: result.value.version }) : result
    },
  )
}
