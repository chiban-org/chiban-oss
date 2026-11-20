import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { BuildingProgramBody } from '@/features/buildingProgram/schema'
import { activePack } from '@/features/packs/registry'
import { packRoles } from '@/features/packs/roles'

type CodeState = { kind: 'enforced' } | { kind: 'dropped'; since: Date | null }

function codeChoiceOf(body: unknown): string | null {
  return (body as BuildingProgramBody).codeChoice
}

async function codeState(db: DbOrTx, signal: AbortSignal): Promise<CodeState> {
  signal.throwIfAborted()
  const published = await db
    .select({ body: configVersions.body, publishedAt: configVersions.publishedAt })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, 'building_program'),
        eq(configVersions.key, 'default'),
        isNotNull(configVersions.publishedAt),
      ),
    )
    .orderBy(desc(configVersions.publishedAt))
  const packDefaultEnforced = activePack().buildingCodes.defaultChoice !== null
  const [current] = published
  if (current === undefined) {
    return packDefaultEnforced ? { kind: 'enforced' } : { kind: 'dropped', since: null }
  }
  if (codeChoiceOf(current.body) !== null) return { kind: 'enforced' }
  let since: Date | null = null
  for (const row of published) {
    if (codeChoiceOf(row.body) !== null) return { kind: 'dropped', since }
    since = row.publishedAt
  }
  return { kind: 'dropped', since: packDefaultEnforced ? since : null }
}

export async function buildingCodeOpenFor(
  db: DbOrTx,
  caseCreatedAt: Date,
  signal: AbortSignal,
): Promise<boolean> {
  if (packRoles().rules.buildingCodeOrder === null) return false
  const state = await codeState(db, signal)
  if (state.kind === 'enforced') return true
  return state.since !== null && caseCreatedAt < state.since
}

export async function buildingCodeEnforced(db: DbOrTx, signal: AbortSignal): Promise<boolean> {
  if (packRoles().rules.buildingCodeOrder === null) return false
  return (await codeState(db, signal)).kind === 'enforced'
}
