import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { checkRange, type RangeError, type ReportRange } from '@/features/reports/range'
import { type FieldSums, fieldSums, loadReportFields } from '@/features/reports/reportFields'
import { err, ok, type Result } from '@/types/result'

export interface ProcessingTimeRow {
  type: string
  issued: number
  medianReceivedToIssued: number | null
  p90ReceivedToIssued: number | null
  medianCompleteToDecision: number | null
  decidedOnTime: number | null
  decidedLate: number | null
  fields: FieldSums
}

interface Raw extends Record<string, unknown> {
  type: string
  issued: number
  med: string | null
  p90: string | null
  med_decision: string | null
  on_time: number | null
  late: number | null
  has_clock: boolean
}

const num = (v: string | null): number | null => (v === null ? null : Number(v))

export async function processingTimeReport(
  db: DbOrTx,
  actor: Actor,
  range: ReportRange,
  signal: AbortSignal,
): Promise<Result<ProcessingTimeRow[], 'forbidden' | RangeError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'report.view', signal)
  if (!allowed.ok) return err('forbidden')
  const checked = checkRange(range)
  if (!checked.ok) return err(checked.error)
  const result = await db.execute<Raw>(sql`
    select a.application_type_key as type, count(*)::int as issued,
      round((percentile_cont(0.5) within group (order by a.issued_on - a.received_date))::numeric, 1)::text as med,
      round((percentile_cont(0.9) within group (order by a.issued_on - a.received_date))::numeric, 1)::text as p90,
      round((percentile_cont(0.5) within group (order by a.decided_on - a.completed_date)
        filter (where c.id is not null and a.decided_on is not null and a.completed_date is not null))::numeric, 1)::text as med_decision,
      (count(*) filter (where c.met_on is not null and c.met_on <= c.current_due))::int as on_time,
      (count(*) filter (where c.met_on is not null and c.met_on > c.current_due))::int as late,
      bool_or(c.id is not null) as has_clock
    from applications a
    left join lateral (
      select id, met_on, current_due from clocks
      where application_id = a.id and rule_key = 'nh.bp.decision' and status = 'met'
      order by created_at desc limit 1
    ) c on true
    where a.issued_on between ${range.from}::date and ${range.to}::date
      and a.received_date is not null
    group by 1 order by 1`)
  const sums = await fieldSums(
    db,
    await loadReportFields(db, signal),
    { range, dateColumn: 'issued_on', byMonth: false },
    signal,
  )
  return ok(
    result.rows.map((r) => ({
      type: r.type,
      issued: r.issued,
      medianReceivedToIssued: num(r.med),
      p90ReceivedToIssued: num(r.p90),
      medianCompleteToDecision: r.has_clock ? num(r.med_decision) : null,
      decidedOnTime: r.has_clock ? r.on_time : null,
      decidedLate: r.has_clock ? r.late : null,
      fields: sums.get(`|${r.type}`) ?? {},
    })),
  )
}
