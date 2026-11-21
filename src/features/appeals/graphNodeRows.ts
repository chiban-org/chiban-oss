import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { appealNodes, clocks } from '@/db/schema'
import type { WindowClock } from '@/features/appeals/routeWindow'

export type GraphNodeRow = typeof appealNodes.$inferSelect & { windowClocks?: WindowClock[] }

const windowClocks = sql<WindowClock[]>`coalesce((
  select json_agg(json_build_object(
    'ruleKey', c.rule_key,
    'startEvent', c.start_event,
    'startDate', c.start_date,
    'currentDue', c.current_due
  ) order by c.created_at desc)
  from ${clocks} c
  where c.application_id = ${appealNodes.applicationId} and c.status <> 'superseded'
), '[]'::json)`

export async function loadGraphNodeRows(
  db: DbOrTx,
  applicationId: string,
): Promise<GraphNodeRow[]> {
  return await db
    .select({ ...getTableColumns(appealNodes), windowClocks })
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
    .orderBy(asc(appealNodes.occurredOn), asc(appealNodes.createdAt))
}
