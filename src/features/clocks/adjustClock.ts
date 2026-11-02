import type { ClockRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { clockAdjustments, clocks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { type AnyActor, actorLabel, toAuditActor } from '@/features/audit/actorRef'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type ClockRow = typeof clocks.$inferSelect

export interface AdjustInput {
  clockId: string
  kind: 'extension' | 'waiver' | 'statutory_exception'
  days?: number
  newDue?: CivilDate
  reason: string
  applicantConsent?: boolean
  legalAuthority?: { citation: string; explanation: string }
}

export type AdjustError =
  | 'forbidden'
  | 'not_found'
  | 'not_extendable'
  | 'not_waivable'
  | 'authority_required'
  | 'consent_required'
  | 'reason_required'
  | 'due_required'

export interface RecordedAdjustment {
  kind: 'extension' | 'waiver' | 'renewal' | 'tolling' | 'statutory_exception'
  days: number | null
  newDue: CivilDate | null
  reason: string
  legalAuthority?: { citation: string; explanation: string }
  applicantConsent?: boolean
  stopsClock?: boolean
}

function nextStatus(clock: ClockRow, adj: RecordedAdjustment): ClockRow['status'] {
  if (adj.stopsClock === true) return 'stopped'
  return clock.status === 'overdue' && adj.newDue !== null ? 'running' : clock.status
}

export async function recordAdjustment(
  tx: Tx,
  actor: AnyActor,
  clock: ClockRow,
  adj: RecordedAdjustment,
  signal: AbortSignal,
): Promise<void> {
  await tx.insert(clockAdjustments).values({
    clockId: clock.id,
    kind: adj.kind,
    days: adj.days,
    newDue: adj.newDue,
    reason: adj.reason,
    legalAuthority: adj.legalAuthority ?? null,
    applicantConsent: adj.applicantConsent ?? false,
    createdBy: actorLabel(actor),
  })
  await tx
    .update(clocks)
    .set({
      currentDue: adj.newDue ?? clock.currentDue,
      status: nextStatus(clock, adj),
    })
    .where(eq(clocks.id, clock.id))
  await writeAudit(
    tx,
    {
      actor: toAuditActor(actor),
      action: `clock.${adj.kind}`,
      entityType: 'application',
      entityId: clock.applicationId,
      before: { currentDue: clock.currentDue },
      after: { clockId: clock.id, ruleKey: clock.ruleKey, newDue: adj.newDue, reason: adj.reason },
    },
    signal,
  )
}

export function checkAdjustment(
  rule: ClockRule,
  input: Pick<AdjustInput, 'kind' | 'applicantConsent'>,
): AdjustError | null {
  if (input.kind === 'extension') {
    if (!rule.extension.allowed) return 'not_extendable'
    if (rule.extension.by === 'applicant_consent' && input.applicantConsent !== true) {
      return 'consent_required'
    }
  }
  if (input.kind === 'waiver' && !rule.waivable) return 'not_waivable'
  return null
}

export async function adjustClock(
  db: Db,
  actor: Actor,
  input: AdjustInput,
  signal: AbortSignal,
  pack: Pack = loadPack(),
): Promise<Result<void, AdjustError>> {
  signal.throwIfAborted()
  const capability =
    input.kind === 'statutory_exception' ? 'gate.record_statutory_exception' : 'clock.adjust'
  if (!(await hasCapability(db, actor.userId, capability, signal))) return err('forbidden')
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  const [clock] = await db.select().from(clocks).where(eq(clocks.id, input.clockId))
  if (clock === undefined) return err('not_found')
  const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
  if (rule.kind !== 'clock') return err('not_found')
  const ruleError = checkAdjustment(rule, input)
  if (ruleError !== null) return err(ruleError)
  const citation = input.legalAuthority?.citation.trim() ?? ''
  const explanation = input.legalAuthority?.explanation.trim() ?? ''
  if (input.kind === 'statutory_exception' && (citation === '' || explanation === '')) {
    return err('authority_required')
  }
  const movesDue = input.kind !== 'waiver'
  const newDue =
    input.newDue ??
    (input.days === undefined ? null : addDays(clock.currentDue as CivilDate, input.days))
  if (movesDue && newDue === null) return err('due_required')
  return await transactionResult(db, async (tx) => {
    await recordAdjustment(
      tx,
      actor,
      clock,
      {
        kind: input.kind,
        days: input.days ?? null,
        newDue: movesDue ? newDue : null,
        reason,
        legalAuthority:
          input.kind === 'statutory_exception' ? { citation, explanation } : undefined,
        applicantConsent: input.applicantConsent,
        stopsClock: input.kind === 'waiver',
      },
      signal,
    )
    return ok(undefined)
  })
}
