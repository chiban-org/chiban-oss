import { and, count, eq, isNull, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { dispositionBatches, exportsTable, legalHolds, preservationRecords } from '@/db/schema'
import { rtkRequestFacets } from '@/features/rtk/requestList'
import type { HomeContext, HomeRow, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

const REQUESTS = '/staff/records/requests'

async function countWhere(ctx: HomeContext, table: PgTable, where: SQL | undefined) {
  ctx.signal.throwIfAborted()
  const [row] = await ctx.db.select({ n: count() }).from(table).where(where)
  return row?.n ?? 0
}

async function rows(
  ctx: HomeContext,
  page: string,
  entries: () => Promise<HomeRow[]>,
): Promise<HomeRow[]> {
  return mayOpen(page, ctx.viewer) ? await entries() : []
}

async function requestRows(ctx: HomeContext): Promise<HomeRow[]> {
  const facets = await rtkRequestFacets(
    ctx.db,
    ctx.actor,
    { filters: {}, today: ctx.today },
    ctx.signal,
  )
  return [
    {
      label: 'Right-to-Know requests past their response day',
      count: facets.due.get('overdue') ?? 0,
      href: `${REQUESTS}?due=overdue`,
    },
    {
      label: 'Right-to-Know requests due this week',
      count: facets.due.get('week') ?? 0,
      href: `${REQUESTS}?due=week`,
    },
  ]
}

async function batchRows(ctx: HomeContext): Promise<HomeRow[]> {
  if (!ctx.viewer.capabilities.has('disposition.approve')) return []
  const proposed = await countWhere(
    ctx,
    dispositionBatches,
    eq(dispositionBatches.status, 'proposed'),
  )
  return [
    {
      label: 'Disposition batches to approve',
      count: proposed,
      href: '/staff/records/retention?batches=all',
    },
  ]
}

function otherRows(ctx: HomeContext): Promise<HomeRow[]>[] {
  return [
    rows(ctx, '/staff/records/preservation', async () => [
      {
        label: 'Preserved copies to try again',
        count: await countWhere(
          ctx,
          preservationRecords,
          eq(preservationRecords.status, 'incomplete'),
        ),
        href: '/staff/records/preservation',
      },
    ]),
    rows(ctx, '/staff/records/retention', () => batchRows(ctx)),
    rows(ctx, '/staff/records/holds', async () => [
      {
        label: 'Legal holds in place',
        count: await countWhere(ctx, legalHolds, isNull(legalHolds.releasedAt)),
        href: '/staff/records/holds',
      },
    ]),
    rows(ctx, '/staff/admin/export', async () => [
      {
        label: 'Exports ready to download',
        count: await countWhere(
          ctx,
          exportsTable,
          and(eq(exportsTable.kind, 'business'), eq(exportsTable.status, 'ready')),
        ),
        href: '/staff/admin/export',
      },
    ]),
  ]
}

export async function loadRecordsSection(ctx: HomeContext): Promise<HomeSection | null> {
  const [requests, ...others] = await Promise.all([
    rows(ctx, REQUESTS, () => requestRows(ctx)),
    ...otherRows(ctx),
  ])
  const all = [...requests, ...others.flat()]
  if (all.length === 0) return null
  return {
    role: 'records_custodian',
    title: 'Records',
    urgency: requests[0]?.count ?? 0,
    rows: all,
    links: mayOpen(REQUESTS, ctx.viewer) ? [{ label: 'Open Right-to-Know', href: REQUESTS }] : [],
    detail: null,
  }
}
