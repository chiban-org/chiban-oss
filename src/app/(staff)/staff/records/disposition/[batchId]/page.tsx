import { eq, inArray } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { dispositionBatches, users } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import type { Status } from '@/features/design/tokens'
import { batchItemChipGroups } from '@/features/disposition/batchItemChips'
import {
  BATCH_ITEM_FILTER_PARAMS,
  BATCH_ITEM_SORT,
  readBatchItemView,
} from '@/features/disposition/batchItemParams'
import { batchItemFacets, listBatchItems } from '@/features/disposition/batchItems'
import { findSeries } from '@/features/records/series'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { BatchRail } from './BatchRail'

export const dynamic = 'force-dynamic'

const STATUS = {
  proposed: 'Waiting for approval',
  approved: 'Approved',
  executing: 'Being carried out',
  executed: 'Carried out',
  cancelled: 'Cancelled',
} as const
const BATCH_CHIP: Record<keyof typeof STATUS, Status> = {
  proposed: 'neutral',
  approved: 'neutral',
  executing: 'neutral',
  executed: 'passed',
  cancelled: 'neutral',
}
const OUTCOME = {
  disposed: 'Disposed of',
  skipped_hold: 'Skipped: a legal hold was placed',
  skipped_not_eligible: 'Skipped: no longer eligible',
} as const
const KIND = { document: 'Document', application_snapshot: 'Application snapshot' } as const

function seriesText(key: string, citation: { label: string } | null): string {
  const series = findSeries(key)
  const cite = citation?.label ?? series?.citation.label ?? null
  const label = series?.label ?? 'Record series'
  return cite === null ? label : `${label} (${cite})`
}

export default async function DispositionBatchPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ batchId: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { batchId } = await routeParams
  if (!isUuid(batchId)) notFound()
  const ctx = await requireStaffContext()
  const mayView =
    (await hasCapability(ctx.db, ctx.actor.userId, 'disposition.approve', ctx.signal)) ||
    (await hasCapability(ctx.db, ctx.actor.userId, 'disposition.propose', ctx.signal))
  if (!mayView) return <NoPermission title="Disposition" action="see disposition batches" />
  const [batch] = await ctx.db
    .select()
    .from(dispositionBatches)
    .where(eq(dispositionBatches.id, batchId))
  if (batch === undefined) notFound()
  const mayApprove = await hasCapability(
    ctx.db,
    ctx.actor.userId,
    'disposition.approve',
    ctx.signal,
  )
  const { params, sort, filters } = readBatchItemView(await searchParams)
  const path = `/staff/records/disposition/${batchId}`
  const [items, facets] = await Promise.all([
    listBatchItems(ctx.db, batchId, { sort, filters }),
    batchItemFacets(ctx.db, batchId, { filters }),
  ])
  const links = sortLinks(path, params, BATCH_ITEM_SORT, sort)
  const clear = clearHref(path, params, BATCH_ITEM_FILTER_PARAMS)
  const people = await ctx.db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, [batch.proposedBy, batch.approvedBy ?? batch.proposedBy]))
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Staff'
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  const sections = (
    <section aria-label="Records in the batch" data-plain className="space-y-4">
      <div className="toolbar">
        <QuickFilters
          label="Quick filters"
          groups={batchItemChipGroups(path, params, facets)}
          clearHref={clear}
        />
      </div>
      <div className="table-panel">
        {items.length === 0 ? (
          <p className="px-5 py-8">No record in this batch matches these filters.</p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr>
                <SortHeader label="Record" link={links.record} />
                <SortHeader label="Kind" link={links.kind} />
                <SortHeader label="Retention series" link={links.series} />
                <SortHeader label="Eligible on" link={links.eligible} />
                <SortHeader label="Result" link={links.result} />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.kind}-${i.recordId}`}>
                  <td>{i.title ?? i.documentTitle ?? 'Application snapshot'}</td>
                  <td className="whitespace-nowrap">{KIND[i.kind]}</td>
                  <td>{seriesText(i.seriesKey, i.citation)}</td>
                  <td className="whitespace-nowrap">{formatCivilDate(i.eligibleOn)}</td>
                  <td>{i.outcome === null ? 'Not yet carried out' : OUTCOME[i.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
  return (
    <main data-wide="">
      <PageHeader
        kicker="Disposition batch"
        title={`As of ${formatCivilDate(batch.asOf)}`}
        status={<StatusChip status={BATCH_CHIP[batch.status]} label={STATUS[batch.status]} />}
        lead="The records this batch disposes of, grouped by kind."
      />
      <RecordLayout
        rail={
          <BatchRail
            batch={batch}
            viewer={{ userId: ctx.actor.userId, mayApprove, nameOf, zone }}
          />
        }
      >
        {sections}
      </RecordLayout>
    </main>
  )
}
