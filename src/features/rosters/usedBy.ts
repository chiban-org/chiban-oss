import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'
import { flagIssuedListStale } from '@/features/abutters/staleList'
import { TERMINAL_STATES } from '@/features/applications/states'
import type { CivilDate } from '@/types/civilDate'

export interface ListUse {
  listId: string
  applicationId: string
  applicationNumber: string
  status: 'draft' | 'issued'
}

const ROSTER_SOURCES = sql`('association_roster', 'park_roster', 'restriction_roster')`
const CONTACT_CHANGED = 'a notice contact on it changed'

export async function listsUsing(
  db: DbOrTx,
  entryIds: readonly string[],
  signal: AbortSignal,
): Promise<Map<string, ListUse[]>> {
  signal.throwIfAborted()
  const found = new Map<string, ListUse[]>()
  if (entryIds.length === 0) return found
  const rows = await db.execute<{
    entry_id: string
    list_id: string
    application_id: string
    number: string
    status: 'draft' | 'issued'
  }>(sql`
    with refs as (
      select l.id as list_id, l.application_id, l.status, p->>'source' as source, p->>'ref' as ref
      from abutter_lists l
      cross join lateral jsonb_array_elements(coalesce(l.snapshot->'recipients', '[]'::jsonb)) r
      cross join lateral jsonb_array_elements(coalesce(r->'provenance', '[]'::jsonb)) p
      where l.status = 'issued'
      union all
      select l.id, l.application_id, l.status, p->>'source', p->>'ref'
      from abutter_lists l
      join abutter_list_recipients ar on ar.list_id = l.id
      cross join lateral jsonb_array_elements(coalesce(ar.data->'provenance', '[]'::jsonb)) p
      where l.status = 'draft'
    )
    select distinct split_part(refs.ref, ':', 1) as entry_id, refs.list_id, refs.application_id,
      a.number, refs.status
    from refs
    join applications a on a.id = refs.application_id
    where refs.source in ${ROSTER_SOURCES}
      and split_part(refs.ref, ':', 1) = any(${uuidArray(entryIds)}::text[])
    order by a.number
  `)
  for (const r of rows.rows) {
    const uses = found.get(r.entry_id) ?? []
    uses.push({
      listId: r.list_id,
      applicationId: r.application_id,
      applicationNumber: r.number,
      status: r.status,
    })
    found.set(r.entry_id, uses)
  }
  return found
}

export async function hearingStillAhead(
  db: DbOrTx,
  applicationId: string,
  today: CivilDate,
): Promise<boolean> {
  const rows = await db.execute<{ ahead: boolean }>(sql`
    select not (
      a.state in (${sql.join(
        TERMINAL_STATES.map((state) => sql`${state}`),
        sql`, `,
      )})
      or exists (
        select 1 from hearings h
        join board_meetings m on m.id = h.meeting_id
        where h.application_id = a.id
          and (
            h.status in ('held', 'continued')
            or h.held_on is not null
            or (h.status = 'scheduled' and m.meeting_date < ${today})
          )
      )
    ) as ahead
    from applications a
    where a.id = ${applicationId}
  `)
  return rows.rows[0]?.ahead === true
}

export async function flagListsUsing(
  db: DbOrTx,
  entryId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<string[]> {
  const uses = (await listsUsing(db, [entryId], signal)).get(entryId) ?? []
  const flagged: string[] = []
  for (const use of uses) {
    if (use.status !== 'issued') continue
    if (!(await hearingStillAhead(db, use.applicationId, today))) continue
    await flagIssuedListStale(db, use.applicationId, signal, CONTACT_CHANGED)
    flagged.push(use.applicationId)
  }
  return flagged
}
