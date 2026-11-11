import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { complaints, documents, type EnforcementStatus, enforcementCases } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { untouchedShells } from '@/features/enforcement/complaintShells'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export type AttachComplaintError =
  | 'forbidden'
  | 'not_found'
  | 'complaint_not_found'
  | 'case_not_open'
  | 'already_on_case'
  | 'complaint_case_in_progress'

export const ENDED_CASE_STATUSES: readonly EnforcementStatus[] = [
  'no_violation',
  'resolved',
  'closed',
]

interface Moved {
  complaintNumber: string
  closedCaseNumber: string | null
}

async function lockedCase(tx: Tx, caseId: string) {
  const [row] = await tx
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
    .for('update')
  return row
}

async function closeShell(
  tx: Tx,
  actor: Actor,
  shell: typeof enforcementCases.$inferSelect,
  context: { reason: string; signal: AbortSignal; targetCaseId: string },
): Promise<void> {
  const { reason } = context
  const today = await townToday(tx, new Date(), context.signal)
  await tx
    .update(documents)
    .set({ recordId: context.targetCaseId })
    .where(
      and(
        eq(documents.recordKind, 'enforcement_case'),
        eq(documents.recordId, shell.id),
        eq(documents.docKind, 'enforcement_photo'),
      ),
    )
  await tx
    .update(enforcementCases)
    .set({
      status: 'closed',
      closedOn: today,
      closureReason: reason,
      rowVersion: shell.rowVersion + 1,
      updatedAt: new Date(),
    })
    .where(eq(enforcementCases.id, shell.id))
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'enforcement.case_status',
      entityType: 'enforcement_case',
      entityId: shell.id,
      before: { status: shell.status },
      after: { status: 'closed', reason },
    },
    context.signal,
  )
}

export async function attachComplaint(
  db: Db,
  actor: Actor,
  input: { caseId: string; complaintId: string },
  signal: AbortSignal,
): Promise<Result<Moved, AttachComplaintError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<Moved, AttachComplaintError>(db, async (tx) => {
    const target = await lockedCase(tx, input.caseId)
    if (target === undefined) return err('not_found')
    if (ENDED_CASE_STATUSES.includes(target.status)) return err('case_not_open')
    const [complaint] = await tx
      .select()
      .from(complaints)
      .where(eq(complaints.id, input.complaintId))
      .for('update')
    if (complaint === undefined || complaint.isProbe) return err('complaint_not_found')
    if (complaint.caseId === target.id) return err('already_on_case')
    const shell = complaint.caseId === null ? undefined : await lockedCase(tx, complaint.caseId)
    if (shell !== undefined && !(await untouchedShells(tx, [shell.id])).has(shell.id)) {
      return err('complaint_case_in_progress')
    }
    await tx.update(complaints).set({ caseId: target.id }).where(eq(complaints.id, complaint.id))
    if (shell !== undefined) {
      const reason = `Complaint ${complaint.number} was moved to case ${target.number}.`
      await closeShell(tx, actor, shell, { reason, signal, targetCaseId: target.id })
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.complaint_attached',
        entityType: 'enforcement_case',
        entityId: target.id,
        before: { complaintCaseId: complaint.caseId },
        after: {
          complaintId: complaint.id,
          complaintNumber: complaint.number,
          fromCaseNumber: shell?.number ?? null,
        },
      },
      signal,
    )
    return ok({ complaintNumber: complaint.number, closedCaseNumber: shell?.number ?? null })
  })
}
