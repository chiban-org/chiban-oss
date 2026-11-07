import { civilDateSchema } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { enforcementCases, PROVISION_KINDS, violationFindings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { mayRecordFinding } from '@/features/enforcement/caseTransitions'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

const FindingSchema = z.object({
  caseId: z.string().uuid(),
  provisionKind: z.enum(PROVISION_KINDS),
  provisionRef: z.string().trim().min(1).max(300),
  facts: z.string().trim().min(1).max(5000),
  inspectionDate: civilDateSchema,
})

export type FindingInput = z.input<typeof FindingSchema>

export async function recordFinding(
  db: Db,
  actor: Actor,
  input: FindingInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<{ findingId: string }, 'forbidden' | 'invalid' | 'not_found' | 'case_not_investigating'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = FindingSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, value.caseId))
      .for('update')
    if (row === undefined) return err('not_found')
    if (!mayRecordFinding(row.status)) {
      return err('case_not_investigating')
    }
    const today = await townToday(tx, now, signal)
    const [finding] = await tx
      .insert(violationFindings)
      .values({
        caseId: value.caseId,
        provisionKind: value.provisionKind,
        provisionRef: value.provisionRef,
        facts: value.facts,
        inspectionDate: value.inspectionDate,
        foundOn: today,
        foundBy: actor.userId,
      })
      .returning({ id: violationFindings.id })
    if (row.status === 'investigating') {
      await tx
        .update(enforcementCases)
        .set({ status: 'violation_found', rowVersion: row.rowVersion + 1, updatedAt: new Date() })
        .where(eq(enforcementCases.id, value.caseId))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.finding_recorded',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { findingId: finding?.id, provisionKind: value.provisionKind },
      },
      signal,
    )
    return ok({ findingId: finding?.id ?? '' })
  })
}
