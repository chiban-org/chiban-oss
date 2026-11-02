import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { feeAssessments, ledgerAllocations, ledgerEntries } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { FeeComputation } from '@/features/fees/computeFees'
import { getTownSettings } from '@/features/town/settings'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const REPORT_METHODS = ['cash', 'check', 'card_present', 'card_online', 'simulated'] as const
export type ReportMethod = (typeof REPORT_METHODS)[number]
export type ByMethod = Record<ReportMethod, number>

export interface CashReceiptsReport {
  date: CivilDate
  townName: string
  methods: ReportMethod[]
  rows: { feeCode: string; label: string; byMethod: ByMethod; totalCents: number }[]
  convenienceFees: ByMethod
  overpayments: ByMethod
  totalsByMethod: ByMethod
  grandTotalCents: number
  entryCount: number
  checks: { number: string; payerName: string; amountCents: number }[]
}

function zeroes(): ByMethod {
  return { cash: 0, check: 0, card_present: 0, card_online: 0, simulated: 0 }
}

function methodOf(entry: { method: string; processor: string | null }): ReportMethod {
  return entry.processor === 'simulated' ? 'simulated' : (entry.method as ReportMethod)
}

export async function labelsFor(db: Db, assessmentIds: string[]): Promise<Map<string, string>> {
  if (assessmentIds.length === 0) return new Map()
  const rows = await db
    .select()
    .from(feeAssessments)
    .where(inArray(feeAssessments.id, assessmentIds))
  const labels = new Map<string, string>()
  for (const row of rows) {
    for (const line of (row.computation as FeeComputation).lines) {
      if (!labels.has(line.code)) labels.set(line.code, line.label)
    }
  }
  return labels
}

async function returnedCheckIds(db: Db, entryIds: string[]): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set()
  const rows = await db
    .select({ reverses: ledgerEntries.reversesEntryId })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.entryType, 'returned_check'),
        inArray(ledgerEntries.reversesEntryId, entryIds),
      ),
    )
  return new Set(rows.flatMap((r) => (r.reverses === null ? [] : [r.reverses])))
}

const FINE_CODE = '\u0000court-imposed-fine'

export async function cashReceiptsReport(
  db: Db,
  actor: Actor,
  input: { date: CivilDate },
  signal: AbortSignal,
): Promise<Result<CashReceiptsReport, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'payment.report', signal)
  if (!allowed.ok) return err('forbidden')
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.businessDate, input.date))
  const allocations =
    entries.length === 0
      ? []
      : await db
          .select()
          .from(ledgerAllocations)
          .where(
            inArray(
              ledgerAllocations.entryId,
              entries.map((e) => e.id),
            ),
          )
  const returned = await returnedCheckIds(
    db,
    entries.map((e) => e.id),
  )
  const methodByEntry = new Map(entries.map((e) => [e.id, methodOf(e)]))
  const totalsByMethod = zeroes()
  for (const e of entries) totalsByMethod[methodOf(e)] += e.amountCents
  const convenienceFees = zeroes()
  const overpayments = zeroes()
  const byCode = new Map<string, ByMethod>()
  for (const a of allocations) {
    const method = methodByEntry.get(a.entryId) ?? 'cash'
    if (a.targetKind === 'convenience_fee') convenienceFees[method] += a.amountCents
    else if (a.targetKind === 'overpayment') overpayments[method] += a.amountCents
    else {
      const code = a.targetKind === 'fine' ? FINE_CODE : (a.feeCode ?? '')
      const row = byCode.get(code) ?? zeroes()
      row[method] += a.amountCents
      byCode.set(code, row)
    }
  }
  const assessmentIds = [
    ...new Set(allocations.flatMap((a) => (a.feeAssessmentId === null ? [] : [a.feeAssessmentId]))),
  ]
  const labels = await labelsFor(db, assessmentIds)
  const town = await getTownSettings(db, signal)
  return ok({
    date: input.date,
    townName: town.ok ? town.value.name : '',
    methods: [...REPORT_METHODS],
    rows: [...byCode.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([feeCode, byMethod]) => ({
        feeCode,
        label: feeCode === FINE_CODE ? 'Court-imposed fine' : (labels.get(feeCode) ?? feeCode),
        byMethod,
        totalCents: Object.values(byMethod).reduce((sum, n) => sum + n, 0),
      })),
    convenienceFees,
    overpayments,
    totalsByMethod,
    grandTotalCents: entries.reduce((sum, e) => sum + e.amountCents, 0),
    entryCount: entries.length,
    checks: entries
      .filter((e) => e.entryType === 'payment' && e.method === 'check' && !returned.has(e.id))
      .map((e) => ({
        number: e.checkNumber ?? '',
        payerName: e.payerName,
        amountCents: e.amountCents,
      })),
  })
}
