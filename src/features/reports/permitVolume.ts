import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { checkRange, type RangeError, type ReportRange } from '@/features/reports/range'
import { getTownSettings } from '@/features/town/settings'
import { err, ok, type Result } from '@/types/result'

export interface PermitVolumeRow {
  month: string
  type: string
  received: number
  issued: number
  closed: number
  denied: number
  withdrawn: number
}

interface CountRow extends Record<string, unknown> {
  month: string
  type: string
  measure: string
  n: number
}

export async function permitVolumeReport(
  db: Db,
  actor: Actor,
  range: ReportRange,
  signal: AbortSignal,
): Promise<Result<PermitVolumeRow[], 'forbidden' | RangeError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'report.view', signal)
  if (!allowed.ok) return err('forbidden')
  const checked = checkRange(range)
  if (!checked.ok) return err(checked.error)
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : 'UTC'
  const counts = await db.execute<CountRow>(sql`
    select to_char(received_date, 'YYYY-MM') as month, application_type_key as type,
      'received' as measure, count(*)::int as n
      from applications where received_date between ${range.from}::date and ${range.to}::date
      group by 1, 2
    union all
    select to_char(issued_on, 'YYYY-MM'), application_type_key, 'issued', count(*)::int
      from applications where issued_on between ${range.from}::date and ${range.to}::date
      group by 1, 2
    union all
    select to_char((l.at at time zone ${zone})::date, 'YYYY-MM'), a.application_type_key,
      l.after ->> 'state', count(*)::int
      from audit_log l join applications a on a.id::text = l.entity_id
      where l.action = 'application.transition' and l.entity_type = 'application'
        and l.after ->> 'state' in ('closed', 'denied', 'withdrawn')
        and (l.at at time zone ${zone})::date between ${range.from}::date and ${range.to}::date
      group by 1, 2, 3`)
  const rows = new Map<string, PermitVolumeRow>()
  for (const c of counts.rows) {
    const key = `${c.month}|${c.type}`
    const row = rows.get(key) ?? {
      month: c.month,
      type: c.type,
      received: 0,
      issued: 0,
      closed: 0,
      denied: 0,
      withdrawn: 0,
    }
    if (c.measure === 'received') row.received = c.n
    else if (c.measure === 'issued') row.issued = c.n
    else if (c.measure === 'closed') row.closed = c.n
    else if (c.measure === 'denied') row.denied = c.n
    else if (c.measure === 'withdrawn') row.withdrawn = c.n
    rows.set(key, row)
  }
  return ok(
    [...rows.values()].sort(
      (a, b) => a.month.localeCompare(b.month) || a.type.localeCompare(b.type),
    ),
  )
}
