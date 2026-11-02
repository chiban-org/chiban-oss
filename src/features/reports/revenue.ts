import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { labelsFor } from '@/features/reports/cashReceipts'
import { checkRange, type RangeError, type ReportRange } from '@/features/reports/range'
import { err, ok, type Result } from '@/types/result'

export type RevenueKind = 'fee' | 'convenience_fee' | 'overpayment' | 'simulated'

export interface RevenueRow {
  month: string
  kind: RevenueKind
  code: string
  label: string
  netCents: number
}

interface Raw extends Record<string, unknown> {
  month: string
  kind: RevenueKind
  code: string
  net: number
  assessments: string[] | null
}

export async function revenueReport(
  db: Db,
  actor: Actor,
  range: ReportRange,
  signal: AbortSignal,
): Promise<Result<RevenueRow[], 'forbidden' | RangeError>> {
  signal.throwIfAborted()
  const reportView = await requireCapability(db, actor.userId, 'report.view', signal)
  const paymentReport = await requireCapability(db, actor.userId, 'payment.report', signal)
  if (!reportView.ok || !paymentReport.ok) return err('forbidden')
  const checked = checkRange(range)
  if (!checked.ok) return err(checked.error)
  const result = await db.execute<Raw>(sql`
    select to_char(e.business_date, 'YYYY-MM') as month,
      case when e.processor = 'simulated' then 'simulated'
           when a.target_kind = 'convenience_fee' then 'convenience_fee'
           when a.target_kind = 'overpayment' then 'overpayment'
           else 'fee' end as kind,
      case when e.processor is distinct from 'simulated' and a.target_kind = 'fee_assessment_line'
           then a.fee_code else '' end as code,
      sum(a.amount_cents)::int as net,
      array_agg(distinct a.fee_assessment_id::text) filter (where a.fee_assessment_id is not null) as assessments
    from ledger_allocations a join ledger_entries e on e.id = a.entry_id
    where e.business_date between ${range.from}::date and ${range.to}::date
    group by 1, 2, 3
    order by 1, 2, 3`)
  const assessmentIds = [...new Set(result.rows.flatMap((r) => r.assessments ?? []))]
  const labels = await labelsFor(db, assessmentIds)
  return ok(
    result.rows.map((r) => ({
      month: r.month,
      kind: r.kind,
      code: r.code,
      label:
        r.kind === 'fee'
          ? (labels.get(r.code) ?? r.code)
          : {
              convenience_fee: 'Convenience fee (not town revenue)',
              overpayment: 'Overpayment held for refund (not town revenue)',
              simulated: 'Simulated payments (not town revenue)',
            }[r.kind],
      netCents: r.net,
    })),
  )
}
