import type { DbOrTx } from '@/db/client'
import { auditLog } from '@/db/schema'

export type AuditActor =
  | { kind: 'user'; userId: string }
  | { kind: 'system'; job: string }
  | { kind: 'anonymous_public_intake' }

export interface AuditEntry {
  actor: AuditActor
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}

export async function writeAudit(
  db: DbOrTx,
  entry: AuditEntry,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  await db.insert(auditLog).values({
    actorKind: entry.actor.kind,
    actorUserId: entry.actor.kind === 'user' ? entry.actor.userId : null,
    actorJob: entry.actor.kind === 'system' ? entry.actor.job : null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  })
}
