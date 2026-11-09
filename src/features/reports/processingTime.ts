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
  decided: number
  decidedNotIssued: number
  medianReceivedToDecision: number | null
  p90ReceivedToDecision: number | null
  fields: FieldSums
}

interface DecisionRaw extends Record<string, unknown> {
  type: string
  decided: number
  not_issued: number
  med: string | null
  p90: string | null
}

interface DecisionStats {
  decided: number
  decidedNotIssued: number
  medianReceivedToDecision: number | null
  p90ReceivedToDecision: number | null
}

const NO_DECISIONS: DecisionStats = {
  decided: 0,
  decidedNotIssued: 0,
  medianReceivedToDecision: null,
  p90ReceivedToDecision: null,
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

async function decisionStats(db: DbOrTx, range: ReportRange): Promise<Map<string, DecisionStats>> {
  const result = await db.execute<DecisionRaw>(sql`
    select a.application_type_key as type, count(*)::int as decided,
      (count(*) filter (where a.issued_on is null))::int as not_issued,
      round((percentile_cont(0.5) within group (order by a.decided_on - a.received_date))::numeric, 1)::text as med,
      round((percentile_cont(0.9) within group (order by a.decided_on - a.received_date))::numeric, 1)::text as p90
    from applications a
    where a.decided_on between ${range.from}::date and ${range.to}::date
      and a.received_date is not null
    group by 1`)
  return new Map(
    result.rows.map((r) => [
      r.type,
      {
        decided: r.decided,
        decidedNotIssued: r.not_issued,
        medianReceivedToDecision: num(r.med),
        p90ReceivedToDecision: num(r.p90),
      },
    ]),
  )
}

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
  const decisions = await decisionStats(db, range)
  const sums = await fieldSums(
    db,
    await loadReportFields(db, signal),
    { range, dateColumn: 'issued_on', byMonth: false },
    signal,
  )
  const issuedRows: ProcessingTimeRow[] = result.rows.map((r) => ({
    type: r.type,
    issued: r.issued,
    medianReceivedToIssued: num(r.med),
    p90ReceivedToIssued: num(r.p90),
    medianCompleteToDecision: r.has_clock ? num(r.med_decision) : null,
    decidedOnTime: r.has_clock ? r.on_time : null,
    decidedLate: r.has_clock ? r.late : null,
    ...(decisions.get(r.type) ?? NO_DECISIONS),
    fields: sums.get(`|${r.type}`) ?? {},
  }))
  const seen = new Set(issuedRows.map((r) => r.type))
  const decidedOnly: ProcessingTimeRow[] = [...decisions]
    .filter(([type]) => !seen.has(type))
    .map(([type, stats]) => ({
      type,
      issued: 0,
      medianReceivedToIssued: null,
      p90ReceivedToIssued: null,
      medianCompleteToDecision: null,
      decidedOnTime: null,
      decidedLate: null,
      ...stats,
      fields: {},
    }))
  return ok([...issuedRows, ...decidedOnly].sort((a, b) => a.type.localeCompare(b.type)))
}
