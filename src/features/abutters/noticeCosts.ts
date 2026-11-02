import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { feeBalance } from '@/features/ledger/feeBalance'
import { err, ok, type Result } from '@/types/result'
import { issuedRecipientCount } from './queries'

export interface NoticeCostLine {
  code: string
  label: string
  assessedCents: number
  paidCents: number
  dueCents: number
}

export interface NoticeCostSummary {
  mailings: number | null
  lines: NoticeCostLine[]
  dueCents: number
}

export async function noticeCostSummary(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<NoticeCostSummary> {
  const balance = await feeBalance(db, applicationId, signal)
  const count = await issuedRecipientCount(db, applicationId, signal)
  const lines = balance.lines
    .filter((l) => l.stage === 'at_notice')
    .map((l) => ({
      code: l.feeCode,
      label: l.label,
      assessedCents: l.assessedCents,
      paidCents: l.paidCents,
      dueCents: l.dueCents,
    }))
  return {
    mailings: count.state === 'known' || count.state === 'stale' ? count.value : null,
    lines,
    dueCents: lines.reduce((sum, l) => sum + l.dueCents, 0),
  }
}

export async function terminateForUnpaidNoticeCosts(
  db: Db,
  actor: Actor,
  input: { applicationId: string; reason: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    void,
    'forbidden' | 'not_found' | 'reason_required' | 'notice_costs_paid' | 'invalid_state'
  >
> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  return await transactionResult<
    void,
    'forbidden' | 'not_found' | 'reason_required' | 'notice_costs_paid' | 'invalid_state'
  >(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const summary = await noticeCostSummary(tx, input.applicationId, signal)
    if (summary.dueCents <= 0) return err('notice_costs_paid')
    const moved = await transitionApplication(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        to: 'denied',
        expectedRowVersion: app.rowVersion,
        closureReason: 'notice_costs_unpaid',
      },
      signal,
      now,
    )
    if (!moved.ok) {
      return err(
        moved.error === 'forbidden' || moved.error === 'not_found' ? moved.error : 'invalid_state',
      )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.terminate_unpaid_notice_costs',
        entityType: 'application',
        entityId: input.applicationId,
        after: { reason, dueCents: summary.dueCents },
      },
      signal,
    )
    return ok(undefined)
  })
}
