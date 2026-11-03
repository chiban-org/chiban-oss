import { sql } from 'drizzle-orm'
import { applications } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'
import { FILING_CLOCK_KEY } from '@/features/decisions/fileDecision'

export const NEXT_DUE = sql<string | null>`(
  select min(c.current_due) from clocks c
  where c.application_id = ${applications.id} and c.status = 'running')`

export const NEXT_DUE_RULE_KEY = sql<string | null>`(
  select c.rule_key from clocks c
  where c.application_id = ${applications.id} and c.status = 'running'
  order by c.current_due asc, c.id asc limit 1)`

export const NOTICE_DUE = sql<string | null>`(
  select min(i.due_on) from notice_items i
  join hearings h on h.notice_set_id = i.set_id and h.status = 'scheduled'
  where h.application_id = ${applications.id}
    and not exists (select 1 from notice_proofs p where p.item_id = i.id))`

export const FILING_DUE = sql<string | null>`(
  select min(c.current_due) from clocks c
  where c.application_id = ${applications.id} and c.rule_key = ${FILING_CLOCK_KEY}
    and c.status in ('running', 'overdue'))`

export const FEES_DUE = sql<number>`(
  select coalesce(sum(greatest(0, l.amt - coalesce(p.paid, 0))), 0)::int
  from (
    select distinct on (fa.stage) fa.stage, fa.computation
    from fee_assessments fa where fa.application_id = ${applications.id}
    order by fa.stage, fa.sequence desc
  ) latest
  cross join lateral (
    select e->>'code' as code, (e->'amount'->>'value')::int as amt
    from jsonb_array_elements(latest.computation->'lines') e
    where e->'amount' ? 'value'
  ) l
  left join (
    select la.stage, la.fee_code, sum(la.amount_cents) as paid
    from ledger_allocations la
    where la.application_id = ${applications.id} and la.target_kind = 'fee_assessment_line'
    group by la.stage, la.fee_code
  ) p on p.stage = latest.stage and p.fee_code = l.code)`

export const UNKNOWN_PAYMENT = sql<boolean>`exists (
  select 1 from payment_attempts pa
  where pa.outcome_unknown and pa.state in ('pending', 'authorized')
    and pa.planned_allocations @> jsonb_build_array(jsonb_build_object('applicationId', ${applications.id}::text)))`

export function preservationIncompleteFor(actor: Actor) {
  if (!hasFullRecordAccess(actor)) return sql<boolean>`false`
  return sql<boolean>`exists (
  select 1 from documents d
  join document_versions dv on dv.document_id = d.id
  join preservation_records pr on pr.original_version_id = dv.id
  where d.record_kind = 'application' and d.record_id = ${applications.id}
    and pr.status = 'incomplete')`
}
