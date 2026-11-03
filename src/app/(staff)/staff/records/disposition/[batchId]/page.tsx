import { eq, inArray } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { dispositionBatches, users } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { batchItemChipGroups } from '@/features/disposition/batchItemChips'
import {
  BATCH_ITEM_FILTER_PARAMS,
  BATCH_ITEM_SORT,
  readBatchItemView,
} from '@/features/disposition/batchItemParams'
import { batchItemFacets, listBatchItems } from '@/features/disposition/batchItems'
import { findSeries } from '@/features/records/series'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate, formatInstantDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { approveDispositionAction, cancelDispositionAction } from '../../retention/actions'

export const dynamic = 'force-dynamic'

const STATUS = {
  proposed: 'Waiting for a records custodian to approve it',
  approved: 'Approved',
  executing: 'Being carried out',
  executed: 'Carried out',
  cancelled: 'Cancelled',
} as const
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
  return (
    <main data-wide="" className="space-y-6">
      <h1>{`Disposition batch as of ${formatCivilDate(batch.asOf)}`}</h1>
      <p className="m-0">{STATUS[batch.status]}</p>
      <p className="m-0">
        {`Proposed by ${nameOf(batch.proposedBy)} on ${formatInstantDate(batch.proposedAt, zone)}.`}
        {batch.approvedBy === null || batch.approvedAt === null
          ? ''
          : ` Approved by ${nameOf(batch.approvedBy)} on ${formatInstantDate(batch.approvedAt, zone)}.`}
      </p>
      <div className="toolbar mt-4">
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
                  <td>{KIND[i.kind]}</td>
                  <td>{seriesText(i.seriesKey, i.citation)}</td>
                  <td>{formatCivilDate(i.eligibleOn)}</td>
                  <td>{i.outcome === null ? 'Not yet carried out' : OUTCOME[i.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {batch.status === 'executed' ? (
        <p className="m-0">{`Carried out ${batch.executedAt === null ? '' : formatInstantDate(batch.executedAt, zone)}. A tombstone records each disposed record, its retention series, and who approved it.`}</p>
      ) : null}
      {batch.status === 'proposed' ? (
        <p className="m-0">{approvalNote(mayApprove, batch.proposedBy === ctx.actor.userId)}</p>
      ) : null}
      {mayApprove && batch.status === 'proposed' && batch.proposedBy !== ctx.actor.userId ? (
        <ActionForm action={approveDispositionAction} submitLabel="Approve and carry out">
          <input type="hidden" name="batchId" value={batch.id} />
          <p className="m-0">
            Approving permanently deletes these records. Holds placed since the proposal are
            respected.
          </p>
        </ActionForm>
      ) : null}
      {batch.status === 'proposed' || batch.status === 'approved' ? (
        <ActionForm action={cancelDispositionAction} submitLabel="Cancel the batch">
          <input type="hidden" name="batchId" value={batch.id} />
        </ActionForm>
      ) : null}
    </main>
  )
}

function approvalNote(mayApprove: boolean, proposedByViewer: boolean): string {
  if (proposedByViewer && mayApprove) {
    return 'You proposed this batch, so another records custodian approves it.'
  }
  return mayApprove
    ? 'A records custodian other than the one who proposed it approves it.'
    : 'A records custodian approves it.'
}
