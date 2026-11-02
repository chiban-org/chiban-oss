import { NH_STARTERS, type StarterBundle } from '@packs/nh/starters'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { configVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  type NewVersionInput,
  type PublishError,
  publishNewVersion,
} from '@/features/config/publish'
import { err, ok, type Result } from '@/types/result'

export type AdoptError = 'forbidden' | 'already_adopted' | 'unknown_starter' | PublishError

export function membersInOrder(starter: StarterBundle): Omit<NewVersionInput, 'upstream'>[] {
  return [
    { kind: 'form', key: starter.form.key, body: starter.form },
    { kind: 'fee_schedule', key: starter.feeSchedule.key, body: starter.feeSchedule },
    {
      kind: 'condition_library',
      key: starter.conditionLibrary.key,
      body: starter.conditionLibrary,
    },
    ...starter.checklists.map((c) => ({
      kind: 'inspection_checklist' as const,
      key: c.key,
      body: c,
    })),
    ...starter.templates.map((t) => ({ kind: 'template' as const, key: t.key, body: t })),
    { kind: 'application_type', key: starter.applicationType.key, body: starter.applicationType },
  ]
}

export async function adoptStarter(
  db: Db,
  actor: Actor,
  starterId: string,
  signal: AbortSignal,
): Promise<Result<{ versionIds: string[] }, AdoptError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  const starter = NH_STARTERS.find((s) => s.id === starterId)
  if (starter === undefined) return err('unknown_starter')
  return await transactionResult<{ versionIds: string[] }, AdoptError>(db, async (tx) => {
    const [existing] = await tx
      .select({ id: configVersions.id })
      .from(configVersions)
      .where(
        and(
          eq(configVersions.kind, 'application_type'),
          eq(configVersions.upstreamTemplateId, starter.id),
        ),
      )
    if (existing !== undefined) return err('already_adopted')
    const versionIds: string[] = []
    for (const member of membersInOrder(starter)) {
      const published = await publishNewVersion(
        tx,
        actor,
        { ...member, upstream: { id: starter.id, version: starter.version } },
        'config.publish',
        signal,
      )
      if (!published.ok) return err(published.error)
      versionIds.push(published.value.versionId)
    }
    return ok({ versionIds })
  })
}
