import { type SQL, sql } from 'drizzle-orm'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const MONTHS_PER_YEAR = 12

function monthsOf(rule: ReturnType<typeof loadPack>['recordSeries'][number]['retention']): number {
  if (rule.kind === 'duration') return rule.years * MONTHS_PER_YEAR
  return rule.kind === 'event' ? rule.plusYears * MONTHS_PER_YEAR : 0
}

function seriesValues(): SQL | null {
  const rows = loadPack().recordSeries.map((s) => {
    const events = s.retention.kind === 'event' ? s.retention.events : []
    const list =
      events.length === 0
        ? sql`array[]::text[]`
        : sql`array[${sql.join(
            events.map((e) => sql`${e}`),
            sql`, `,
          )}]::text[]`
    return sql`(${s.key}, ${s.retention.kind}, ${monthsOf(s.retention)}::int, ${list}, ${s.label})`
  })
  return rows.length === 0 ? null : sql.join(rows, sql`, `)
}

export function classifiedRecords(asOf: CivilDate, zone: string): SQL | null {
  const series = seriesValues()
  if (series === null) return null
  return sql`with series(key, rule, months, events, label) as (values ${series}),
rec as (
  select ra.record_kind as kind, ra.record_id as id, ra.series_key,
    coalesce(d.created_at, s.created_at) as created_at,
    d.record_kind as doc_kind, d.record_id as doc_record, d.title as doc_title,
    s.sequence as snap_seq,
    case
      when ra.record_kind = 'application_snapshot' then s.application_id
      when d.record_kind = 'application' then d.record_id
      when d.record_kind = 'inspection'
        then (select i.application_id from inspections i where i.id = d.record_id)
    end as app_id
  from retention_assignments ra
  left join documents d on ra.record_kind = 'document' and d.id = ra.record_id
  left join application_snapshots s
    on ra.record_kind = 'application_snapshot' and s.id = ra.record_id
  where ra.superseded_at is null
    and ((d.id is not null and d.disposed_at is null) or s.id is not null)
),
linked as (
  select rec.*, a.number as app_number,
    case when rec.doc_kind = 'project' then rec.doc_record else a.project_id end as project_id
  from rec left join applications a on a.id = rec.app_id
),
timed as (
  select l.*, sr.rule, sr.label as series_label, sr.months, sr.events,
    (select min(e.occurred_on) from record_events e
      where e.kind = any(sr.events) and (
        (l.doc_kind = 'enforcement_case' and e.case_id = l.doc_record)
        or ((e.project_id = l.project_id
            or (l.doc_kind = 'parcel'
              and e.project_id in (select p.id from projects p where p.parcel_id = l.doc_record)))
          and (l.app_id is null or e.application_id is null or e.application_id = l.app_id))
      )) as first_event,
    (select count(*)::int from legal_holds h where h.released_at is null and (
        (h.target_kind = 'document' and l.kind = 'document' and h.target_id = l.id)
        or (h.target_kind = 'application' and h.target_id = l.app_id)
        or (h.target_kind = 'project' and h.target_id = l.project_id)
        or (h.target_kind = l.doc_kind and l.doc_kind in ('enforcement_case', 'rtk_request')
          and h.target_id = l.doc_record)
      )) as holds
  from linked l join series sr on sr.key = l.series_key
  where sr.rule <> 'permanent'
),
dated as (
  select t.*,
    case
      when t.rule = 'duration'
        then ((t.created_at at time zone ${zone})::date + make_interval(months => t.months))::date
      when t.first_event is not null
        then (t.first_event + make_interval(months => t.months))::date
    end as eligible_on
  from timed t
),
classified as (
  select d.*,
    case
      when d.holds > 0 then 'on_hold'
      when d.eligible_on is null then 'awaiting_event'
      when d.eligible_on <= ${asOf}::date then 'eligible'
    end as state,
    case when d.kind = 'application_snapshot'
      then 'Application ' || d.app_number || ', snapshot ' || d.snap_seq
      else d.doc_title end as title,
    case
      when d.kind = 'application_snapshot' then 'application'
      when d.doc_kind = 'project' then 'parcel'
      else d.doc_kind end as link_kind,
    case
      when d.kind = 'application_snapshot' then d.app_id::text
      when d.doc_kind = 'project'
        then (select p.parcel_id::text from projects p where p.id = d.doc_record)
      else d.doc_record::text end as link_id,
    coalesce(d.app_number,
      (select c.number from enforcement_cases c
        where d.doc_kind = 'enforcement_case' and c.id = d.doc_record),
      (select r.number from rtk_requests r where d.doc_kind = 'rtk_request' and r.id = d.doc_record),
      (select p.title from projects p where d.doc_kind = 'project' and p.id = d.doc_record)
    ) as owner_label,
    case
      when d.doc_kind = 'enforcement_case' then 'case'
      when d.project_id is not null then 'project'
    end as event_kind,
    case
      when d.doc_kind = 'enforcement_case' then d.doc_record::text
      else d.project_id::text end as event_id
  from dated d
)`
}
