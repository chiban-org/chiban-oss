import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import {
  complaints,
  type EnforcementStatus,
  enforcementCases,
  violationFindings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  CASE_TRANSITIONS,
  STATUSES_SET_BY_THEIR_STEP,
} from '@/features/enforcement/caseTransitions'
import { nextEnforcementNumber } from '@/features/enforcement/numbering'
import { caseJustOpenedBy, lockCaseOpening } from '@/features/enforcement/openCaseReuse'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

const OpenCaseSchema = z.object({
  parcelId: z.string().uuid().optional(),
  locationText: z.string().trim().min(1).max(300),
  complaintIds: z.array(z.string().uuid()).max(50).optional(),
})

export type OpenCaseInput = z.input<typeof OpenCaseSchema>

export async function lockCase(tx: Tx, caseId: string): Promise<void> {
  await tx
    .select({ id: enforcementCases.id })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
    .for('update')
}

export async function openCase(
  db: Db,
  actor: Actor,
  input: OpenCaseInput,
  signal: AbortSignal,
  now: Date = new Date(),
  options: { reuseWithinSeconds?: number } = {},
): Promise<Result<{ caseId: string; number: string }, 'forbidden' | 'invalid'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = OpenCaseSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    if (options.reuseWithinSeconds !== undefined) {
      await lockCaseOpening(tx, actor, value)
      const repeated = await caseJustOpenedBy(tx, actor, value, options.reuseWithinSeconds)
      if (repeated !== null) return ok(repeated)
    }
    const { number, today } = await nextEnforcementNumber(tx, 'EC', now, signal)
    const [row] = await tx
      .insert(enforcementCases)
      .values({
        number,
        parcelId: value.parcelId ?? null,
        locationText: value.locationText,
        openedOn: today,
        assignedTo: actor.userId,
      })
      .returning({ id: enforcementCases.id })
    const caseId = row?.id ?? ''
    if (value.parcelId !== undefined) {
      await linkRecordToParcel(
        tx,
        { recordKind: 'enforcement_case', recordId: caseId, parcelId: value.parcelId },
        signal,
      )
    }
    if (value.complaintIds !== undefined && value.complaintIds.length > 0) {
      await tx
        .update(complaints)
        .set({ caseId })
        .where(and(inArray(complaints.id, value.complaintIds), isNull(complaints.caseId)))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.case_opened',
        entityType: 'enforcement_case',
        entityId: caseId,
        after: { number, locationText: value.locationText },
      },
      signal,
    )
    return ok({ caseId, number })
  })
}

export type SetStatusError =
  | 'forbidden'
  | 'not_found'
  | 'invalid_transition'
  | 'stale_version'
  | 'reason_required'
  | 'finding_required'

async function transitionBlock(
  tx: Tx,
  caseId: string,
  to: EnforcementStatus,
  reason: string,
): Promise<SetStatusError | null> {
  if (STATUSES_SET_BY_THEIR_STEP.includes(to)) return 'invalid_transition'
  if (to === 'closed' && reason === '') return 'reason_required'
  if (to !== 'violation_found') return null
  const [found] = await tx
    .select({ n: count() })
    .from(violationFindings)
    .where(eq(violationFindings.caseId, caseId))
  return (found?.n ?? 0) === 0 ? 'finding_required' : null
}

export async function setCaseStatus(
  db: Db,
  actor: Actor,
  input: { caseId: string; to: EnforcementStatus; reason?: string; expectedRowVersion: number },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ status: EnforcementStatus; rowVersion: number }, SetStatusError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, input.caseId))
      .for('update')
    if (row === undefined) return err('not_found')
    if (row.rowVersion !== input.expectedRowVersion) return err('stale_version')
    if (!CASE_TRANSITIONS[row.status].includes(input.to)) return err('invalid_transition')
    const reason = input.reason?.trim() ?? ''
    const blocked = await transitionBlock(tx, input.caseId, input.to, reason)
    if (blocked !== null) return err(blocked)
    const today = await townToday(tx, now, signal)
    const rowVersion = row.rowVersion + 1
    await tx
      .update(enforcementCases)
      .set({
        status: input.to,
        rowVersion,
        updatedAt: new Date(),
        ...(input.to === 'closed' ? { closedOn: today, closureReason: reason } : {}),
      })
      .where(eq(enforcementCases.id, input.caseId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.case_status',
        entityType: 'enforcement_case',
        entityId: input.caseId,
        before: { status: row.status },
        after: { status: input.to, reason: reason === '' ? null : reason },
      },
      signal,
    )
    return ok({ status: input.to, rowVersion })
  })
}
