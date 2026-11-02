import { civilDateSchema } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { enforcementCases, projects, recordEvents } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { townToday } from '@/features/town/today'
import { daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const PROJECT_EVENT_KINDS = ['building_removed', 'septic_replaced_or_removed'] as const
export const CASE_EVENT_KINDS = ['appeal_period_expired'] as const

const EventSchema = z.object({
  target: z.union([
    z.object({ projectId: z.string().uuid() }),
    z.object({ caseId: z.string().uuid() }),
  ]),
  kind: z.enum([...PROJECT_EVENT_KINDS, ...CASE_EVENT_KINDS]),
  occurredOn: civilDateSchema,
  note: z.string().trim().max(1000).optional(),
})

export type RetentionEventInput = z.input<typeof EventSchema>

export async function recordRetentionEvent(
  db: Db,
  actor: Actor,
  input: RetentionEventInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<void, 'forbidden' | 'invalid' | 'not_found' | 'future_date' | 'kind_not_for_target'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = EventSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  const forCase = 'caseId' in value.target
  const kinds: readonly string[] = forCase ? CASE_EVENT_KINDS : PROJECT_EVENT_KINDS
  if (!kinds.includes(value.kind)) return err('kind_not_for_target')
  return await transactionResult(db, async (tx) => {
    const today = await townToday(tx, now, signal)
    if (daysBetween(today, value.occurredOn) > 0) return err('future_date')
    const target = value.target
    const [found] =
      'caseId' in target
        ? await tx
            .select({ id: enforcementCases.id })
            .from(enforcementCases)
            .where(eq(enforcementCases.id, target.caseId))
        : await tx
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.id, target.projectId))
    if (found === undefined) return err('not_found')
    await tx.insert(recordEvents).values({
      projectId: 'projectId' in target ? target.projectId : null,
      caseId: 'caseId' in target ? target.caseId : null,
      kind: value.kind,
      occurredOn: value.occurredOn,
      recordedByKind: 'user',
      recordedBy: actor.userId,
      note: value.note ?? null,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'record.retention_event',
        entityType: 'caseId' in target ? 'enforcement_case' : 'project',
        entityId: 'caseId' in target ? target.caseId : target.projectId,
        after: { kind: value.kind, occurredOn: value.occurredOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
