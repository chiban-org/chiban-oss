import { NH_STARTERS } from '@packs/nh/starters'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { configVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { membersInOrder } from '@/features/config/adoptStarter'
import { applyPointerChanges } from '@/features/config/jsonPointer'
import type { ConfigKind } from '@/features/config/kinds'
import { type PublishError, publishNewVersion } from '@/features/config/publish'
import { starterDiff } from '@/features/config/starterDiff'
import { getPublished } from '@/features/config/store'
import { err, ok, type Result } from '@/types/result'

export type ApplyStarterPathsError = 'forbidden' | 'not_adopted' | 'unknown_path' | PublishError

export interface ApplyStarterPathsInput {
  kind: ConfigKind
  key: string
  paths: string[]
}

function findMember(input: ApplyStarterPathsInput) {
  for (const starter of NH_STARTERS) {
    const member = membersInOrder(starter).find((m) => m.kind === input.kind && m.key === input.key)
    if (member !== undefined) return { starter, member }
  }
  return undefined
}

export async function applyStarterPaths(
  db: Db,
  actor: Actor,
  input: ApplyStarterPathsInput,
  signal: AbortSignal,
): Promise<Result<{ version: number }, ApplyStarterPathsError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<{ version: number }, ApplyStarterPathsError>(db, async (tx) => {
    const published = await getPublished(tx, input.kind, input.key, signal)
    const found = findMember(input)
    if (published === null || found === undefined) return err('not_adopted')
    const { starter, member } = found
    const [adoption] = await tx
      .select({ id: configVersions.id })
      .from(configVersions)
      .where(
        and(
          eq(configVersions.kind, 'application_type'),
          eq(configVersions.upstreamTemplateId, starter.id),
        ),
      )
    if (adoption === undefined) return err('not_adopted')
    const diff = starterDiff(published.body, member.body)
    const chosen = input.paths.map((path) => diff.find((d) => d.path === path))
    const entries = chosen.flatMap((entry) => (entry === undefined ? [] : [entry]))
    if (entries.length !== chosen.length) return err('unknown_path')
    const ordered = diff.filter((d) => entries.includes(d))
    const body = applyPointerChanges(
      published.body,
      ordered.map((d) => ({ pointer: d.path, value: d.upstream })),
    )
    const result = await publishNewVersion(
      tx,
      actor,
      {
        kind: input.kind,
        key: input.key,
        body,
        upstream: { id: starter.id, version: starter.version },
      },
      'config.publish',
      signal,
    )
    if (!result.ok) return err(result.error)
    return ok({ version: result.value.version })
  })
}
