import type { AuditActor } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'

export interface SystemActor {
  kind: 'system'
  job: string
}

export type AnyActor = Actor | SystemActor

export function toAuditActor(actor: AnyActor): AuditActor {
  return actor.kind === 'system'
    ? { kind: 'system', job: actor.job }
    : { kind: 'user', userId: actor.userId }
}

export function actorLabel(actor: AnyActor): string {
  return actor.kind === 'system' ? `job:${actor.job}` : actor.userId
}
