import { and, eq, inArray, sql } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import { applications, ledgerAllocations, ledgerEntries } from '@/db/schema'
import { assessedLines, lineKey, paidByLine } from '@/features/ledger/lineTotals'
import type { AllocationInput, PostEntryInput } from '@/features/ledger/types'
import { getTownSettings } from '@/features/town/settings'
import { todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type PostEntryError = 'over_allocated' | 'over_reversed'

const FALLBACK_TIME_ZONE = 'UTC'

function allocationKey(a: AllocationInput): string {
  return [a.targetKind, a.applicationId ?? '', a.stage ?? '', a.feeCode ?? ''].join('|')
}

function netByKey(allocations: AllocationInput[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const a of allocations) {
    totals.set(allocationKey(a), (totals.get(allocationKey(a)) ?? 0) + a.amountCents)
  }
  return totals
}

async function lockApplications(tx: Tx, allocations: AllocationInput[]): Promise<void> {
  const ids = [
    ...new Set(
      allocations.flatMap((a) => (a.applicationId === undefined ? [] : [a.applicationId])),
    ),
  ]
  if (ids.length === 0) return
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(inArray(applications.id, ids))
    .orderBy(applications.id)
    .for('update')
}

async function exceedsDue(tx: Tx, allocations: AllocationInput[]): Promise<boolean> {
  const byApplication = new Map<string, Map<string, number>>()
  for (const a of allocations) {
    if (a.targetKind !== 'fee_assessment_line' || a.applicationId === undefined) continue
    const lines = byApplication.get(a.applicationId) ?? new Map<string, number>()
    const key = lineKey(a.stage ?? '', a.feeCode ?? '')
    lines.set(key, (lines.get(key) ?? 0) + a.amountCents)
    byApplication.set(a.applicationId, lines)
  }
  for (const [applicationId, deltas] of byApplication) {
    const assessed = new Map(
      (await assessedLines(tx, applicationId)).map((l) => [
        lineKey(l.stage, l.feeCode),
        l.assessedCents,
      ]),
    )
    const paid = await paidByLine(tx, applicationId)
    for (const [key, delta] of deltas) {
      if (delta <= 0) continue
      const due = (assessed.get(key) ?? 0) - (paid.get(key) ?? 0)
      if (delta > due) return true
    }
  }
  return false
}

async function exceedsNetPaid(
  tx: Tx,
  reversesEntryId: string,
  allocations: AllocationInput[],
): Promise<boolean> {
  const negatives = [...netByKey(allocations).entries()].filter(([, cents]) => cents < 0)
  if (negatives.length === 0) return false
  const rows = await tx.execute<{
    target_kind: string
    application_id: string | null
    stage: string | null
    fee_code: string | null
    net: number
  }>(sql`
    with recursive tree as (
      select id from ledger_entries where id = ${reversesEntryId}
      union all
      select l.id from ledger_entries l join tree t on l.reverses_entry_id = t.id
    )
    select a.target_kind, a.application_id, a.stage, a.fee_code, sum(a.amount_cents)::int as net
    from ledger_allocations a join tree t on a.entry_id = t.id
    group by a.target_kind, a.application_id, a.stage, a.fee_code
  `)
  const available = new Map(
    rows.rows.map((r) => [
      [r.target_kind, r.application_id ?? '', r.stage ?? '', r.fee_code ?? ''].join('|'),
      r.net,
    ]),
  )
  return negatives.some(([key, cents]) => -cents > (available.get(key) ?? 0))
}

async function findProcessorEntry(tx: Tx, input: PostEntryInput): Promise<string | null> {
  if (input.processor === undefined) return null
  const [existing] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.processorAccountId, input.processor.accountId),
        eq(ledgerEntries.processorObjectId, input.processor.objectId),
        eq(ledgerEntries.entryType, input.entryType),
      ),
    )
  return existing?.id ?? null
}

async function existingProcessorEntry(tx: Tx, input: PostEntryInput): Promise<string> {
  const id = await findProcessorEntry(tx, input)
  if (id === null) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Ledger entry insert returned no row')
  }
  return id
}

export async function postEntry(
  tx: Tx,
  input: PostEntryInput,
  signal: AbortSignal,
): Promise<Result<{ entryId: string }, PostEntryError>> {
  signal.throwIfAborted()
  const total = input.allocations.reduce((sum, a) => sum + a.amountCents, 0)
  if (input.allocations.length === 0 || total !== input.amountCents) {
    throw new AppError(
      ErrorIds.PAY_ALLOCATION_MISMATCH,
      'Ledger entry allocations must sum to the entry amount',
      { amountCents: input.amountCents, allocated: total },
    )
  }
  if (input.processor !== undefined) {
    const existing = await findProcessorEntry(tx, input)
    if (existing !== null) return ok({ entryId: existing })
  }
  await lockApplications(tx, input.allocations)
  if (await exceedsDue(tx, input.allocations)) return err('over_allocated')
  if (
    input.reversesEntryId !== undefined &&
    (await exceedsNetPaid(tx, input.reversesEntryId, input.allocations))
  ) {
    return err('over_reversed')
  }
  const town = await getTownSettings(tx, signal)
  const businessDate = todayInTimeZone(
    town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE,
    input.postedAt,
  )
  const [entry] = await tx
    .insert(ledgerEntries)
    .values({
      entryType: input.entryType,
      method: input.method,
      amountCents: input.amountCents,
      postedAt: input.postedAt,
      businessDate,
      receiptId: input.receiptId ?? null,
      reversesEntryId: input.reversesEntryId ?? null,
      paymentAttemptId: input.paymentAttemptId ?? null,
      processor: input.processor?.name ?? null,
      processorAccountId: input.processor?.accountId ?? null,
      processorObjectId: input.processor?.objectId ?? null,
      checkNumber: input.checkNumber ?? null,
      payerName: input.payerName,
      payerUserId: input.payerUserId ?? null,
      reason: input.reason ?? null,
      actorKind: input.actor.kind === 'system' ? 'system' : 'user',
      actorUserId: input.actor.kind === 'user' ? input.actor.userId : null,
      actorJob: input.actor.kind === 'system' ? input.actor.job : null,
    })
    .onConflictDoNothing()
    .returning({ id: ledgerEntries.id })
  if (entry === undefined) return ok({ entryId: await existingProcessorEntry(tx, input) })
  await tx.insert(ledgerAllocations).values(
    input.allocations.map((a) => ({
      entryId: entry.id,
      targetKind: a.targetKind,
      applicationId: a.applicationId ?? null,
      feeAssessmentId: a.feeAssessmentId ?? null,
      stage: a.stage ?? null,
      feeCode: a.feeCode ?? null,
      amountCents: a.amountCents,
    })),
  )
  return ok({ entryId: entry.id })
}
