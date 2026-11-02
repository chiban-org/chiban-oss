import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, documents, enforcementCases, projects, rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type HoldTarget, placeHold } from '@/features/records/holds'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

type ReferenceError = 'not_found' | 'ambiguous' | 'already_disposed'

async function resolveDocument(db: DbOrTx, ref: string): Promise<Result<string, ReferenceError>> {
  const match = isUuid(ref)
    ? sql`${documents.id} = ${ref}::uuid`
    : sql`lower(${documents.title}) = lower(${ref})`
  const rows = await db
    .select({ id: documents.id, disposedAt: documents.disposedAt })
    .from(documents)
    .where(match)
  const live = rows.filter((r) => r.disposedAt === null)
  if (live.length > 1) return err('ambiguous')
  const [only] = live
  if (only !== undefined) return ok(only.id)
  return err(rows.length > 0 ? 'already_disposed' : 'not_found')
}

async function idsByNumberOrTitle(
  db: DbOrTx,
  kind: Exclude<HoldTarget['kind'], 'document'>,
  ref: string,
): Promise<string[]> {
  switch (kind) {
    case 'application':
      return (
        await db
          .select({ id: applications.id })
          .from(applications)
          .where(sql`lower(${applications.number}) = lower(${ref})`)
      ).map((r) => r.id)
    case 'project':
      return (
        await db
          .select({ id: projects.id })
          .from(projects)
          .where(sql`lower(${projects.title}) = lower(${ref})`)
      ).map((r) => r.id)
    case 'enforcement_case':
      return (
        await db
          .select({ id: enforcementCases.id })
          .from(enforcementCases)
          .where(sql`lower(${enforcementCases.number}) = lower(${ref})`)
      ).map((r) => r.id)
    case 'rtk_request':
      return (
        await db
          .select({ id: rtkRequests.id })
          .from(rtkRequests)
          .where(sql`lower(${rtkRequests.number}) = lower(${ref})`)
      ).map((r) => r.id)
  }
}

async function resolveHoldReference(
  db: DbOrTx,
  kind: HoldTarget['kind'],
  reference: string,
): Promise<Result<string, ReferenceError>> {
  const ref = reference.trim()
  if (ref === '') return err('not_found')
  if (kind === 'document') return await resolveDocument(db, ref)
  if (isUuid(ref)) return ok(ref)
  const matches = await idsByNumberOrTitle(db, kind, ref)
  if (matches.length > 1) return err('ambiguous')
  const [only] = matches
  return only === undefined ? err('not_found') : ok(only)
}

export async function placeHoldByReference(
  db: DbOrTx,
  actor: Actor,
  input: { kind: HoldTarget['kind']; reference: string; reason: string },
  signal: AbortSignal,
): Promise<Result<{ holdId: string }, 'forbidden' | 'reason_required' | ReferenceError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'hold.place_release', signal)
  if (!allowed.ok) return err('forbidden')
  const resolved = await resolveHoldReference(db, input.kind, input.reference)
  if (!resolved.ok) return resolved
  return await placeHold(
    db,
    actor,
    { target: { kind: input.kind, id: resolved.value }, reason: input.reason },
    signal,
  )
}
