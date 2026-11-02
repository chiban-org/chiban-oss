import { asc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { NoPermission } from '@/components/staff/NoPermission'
import { dispositionBatches, dispositionItems, dispositionTombstones, documents } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
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

export default async function DispositionBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
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
  const items = await ctx.db
    .select({
      kind: dispositionItems.recordKind,
      recordId: dispositionItems.recordId,
      seriesKey: dispositionItems.seriesKey,
      eligibleOn: dispositionItems.eligibleOn,
      outcome: dispositionItems.outcome,
      title: dispositionTombstones.title,
      documentTitle: documents.title,
      citation: dispositionTombstones.seriesCitation,
    })
    .from(dispositionItems)
    .leftJoin(dispositionTombstones, eq(dispositionTombstones.recordId, dispositionItems.recordId))
    .leftJoin(documents, eq(documents.id, dispositionItems.recordId))
    .where(eq(dispositionItems.batchId, batchId))
    .orderBy(asc(dispositionItems.recordKind), asc(dispositionItems.recordId))
  return (
    <main className="space-y-6">
      <h1>{`Disposition batch as of ${formatCivilDate(batch.asOf)}`}</h1>
      <p className="m-0">{STATUS[batch.status]}</p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Kind</th>
            <th scope="col">Eligible on</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.kind}-${i.recordId}`}>
              <td>{i.title ?? i.documentTitle ?? 'Application snapshot'}</td>
              <td>{KIND[i.kind]}</td>
              <td>{formatCivilDate(i.eligibleOn)}</td>
              <td>{i.outcome === null ? 'Not yet carried out' : OUTCOME[i.outcome]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {batch.status === 'executed' ? (
        <p className="m-0">{`Carried out ${batch.executedAt === null ? '' : formatInstantDate(batch.executedAt, 'America/New_York')}. A tombstone records each disposed record, its retention series, and who approved it.`}</p>
      ) : null}
      {mayApprove && batch.status === 'proposed' ? (
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
