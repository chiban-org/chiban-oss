import { civilDateSchema } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import { type EnforcementStatus, PROVISION_KINDS, violationFindings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  type FindingRow,
  findingInUse,
  lockFindingWithCase,
  returnCaseIfAllWithdrawn,
  settleCompliedOrders,
} from '@/features/enforcement/findingSettle'
import { err, ok, type Result } from '@/types/result'

const EditSchema = z.object({
  findingId: z.string().uuid(),
  provisionKind: z.enum(PROVISION_KINDS),
  provisionRef: z.string().trim().min(1).max(300),
  facts: z.string().trim().min(1).max(5000),
  inspectionDate: civilDateSchema,
})

const WithdrawSchema = z.object({
  findingId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
})

const CorrectedSchema = z.object({
  findingId: z.string().uuid(),
  correctedOn: civilDateSchema,
  note: z.string().trim().max(1000),
})

type ChangeError = 'forbidden' | 'invalid' | 'not_found' | 'finding_not_open'

function snapshot(f: FindingRow) {
  return {
    findingId: f.id,
    provisionKind: f.provisionKind,
    provisionRef: f.provisionRef,
    facts: f.facts,
    inspectionDate: f.inspectionDate,
    status: f.status,
  }
}

async function mayManage(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  return (await requireCapability(db, actor.userId, 'enforcement.manage', signal)).ok
}

async function auditChange(
  tx: Tx,
  actor: Actor,
  entry: { action: string; caseId: string; before: unknown; after: unknown },
  signal: AbortSignal,
): Promise<void> {
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: entry.action,
      entityType: 'enforcement_case',
      entityId: entry.caseId,
      before: entry.before,
      after: entry.after,
    },
    signal,
  )
}

export async function editFinding(
  db: Db,
  actor: Actor,
  input: z.input<typeof EditSchema>,
  signal: AbortSignal,
): Promise<Result<void, ChangeError | 'finding_in_use'>> {
  if (!(await mayManage(db, actor, signal))) return err('forbidden')
  const parsed = EditSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const { findingId, ...values } = parsed.data
  return await transactionResult(db, async (tx: Tx) => {
    const locked = await lockFindingWithCase(tx, findingId)
    if (locked === null) return err('not_found')
    const { finding } = locked
    if (finding.status !== 'open') return err('finding_not_open')
    if (await findingInUse(tx, finding)) return err('finding_in_use')
    await tx.update(violationFindings).set(values).where(eq(violationFindings.id, finding.id))
    await auditChange(
      tx,
      actor,
      {
        action: 'enforcement.finding_edited',
        caseId: finding.caseId,
        before: snapshot(finding),
        after: snapshot({ ...finding, ...values }),
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function withdrawFinding(
  db: Db,
  actor: Actor,
  input: z.input<typeof WithdrawSchema>,
  signal: AbortSignal,
): Promise<Result<{ caseStatus: EnforcementStatus }, ChangeError>> {
  if (!(await mayManage(db, actor, signal))) return err('forbidden')
  const parsed = WithdrawSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const { findingId, reason } = parsed.data
  return await transactionResult(db, async (tx: Tx) => {
    const locked = await lockFindingWithCase(tx, findingId)
    if (locked === null) return err('not_found')
    const { finding, caseRow } = locked
    if (finding.status !== 'open') return err('finding_not_open')
    await tx
      .update(violationFindings)
      .set({
        status: 'withdrawn',
        withdrawnReason: reason,
        withdrawnBy: actor.userId,
        withdrawnAt: new Date(),
      })
      .where(eq(violationFindings.id, finding.id))
    await auditChange(
      tx,
      actor,
      {
        action: 'enforcement.finding_withdrawn',
        caseId: finding.caseId,
        before: { findingId, status: 'open' },
        after: { findingId, status: 'withdrawn', reason },
      },
      signal,
    )
    await settleCompliedOrders(tx, actor, finding.caseId, signal)
    return ok({ caseStatus: await returnCaseIfAllWithdrawn(tx, actor, caseRow, signal) })
  })
}

export async function markFindingCorrected(
  db: Db,
  actor: Actor,
  input: z.input<typeof CorrectedSchema>,
  signal: AbortSignal,
): Promise<Result<void, ChangeError>> {
  if (!(await mayManage(db, actor, signal))) return err('forbidden')
  const parsed = CorrectedSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const { findingId, correctedOn, note } = parsed.data
  return await transactionResult(db, async (tx: Tx) => {
    const locked = await lockFindingWithCase(tx, findingId)
    if (locked === null) return err('not_found')
    const { finding } = locked
    if (finding.status !== 'open') return err('finding_not_open')
    await tx
      .update(violationFindings)
      .set({
        status: 'corrected',
        correctedOn,
        correctedNote: note === '' ? null : note,
        correctedBy: actor.userId,
      })
      .where(eq(violationFindings.id, finding.id))
    await auditChange(
      tx,
      actor,
      {
        action: 'enforcement.finding_corrected',
        caseId: finding.caseId,
        before: { findingId, status: 'open' },
        after: { findingId, status: 'corrected', correctedOn, note: note === '' ? null : note },
      },
      signal,
    )
    await settleCompliedOrders(tx, actor, finding.caseId, signal)
    return ok(undefined)
  })
}
