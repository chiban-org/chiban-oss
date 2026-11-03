import { ActionForm } from '@/components/ActionForm'
import { NextStep } from '@/components/layout/NextStep'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import type { dispositionBatches } from '@/db/schema'
import { formatInstantDate } from '@/lib/formatDate'
import { approveDispositionAction, cancelDispositionAction } from '../../retention/actions'

type Batch = typeof dispositionBatches.$inferSelect

export interface BatchViewer {
  userId: string
  mayApprove: boolean
  nameOf: (id: string) => string
  zone: string
}

function approvalNote(mayApprove: boolean, proposedByViewer: boolean): string {
  if (proposedByViewer && mayApprove) {
    return 'You proposed this batch, so another records custodian approves it.'
  }
  return mayApprove
    ? 'A records custodian other than the one who proposed it approves it.'
    : 'A records custodian approves it.'
}

function batchFacts(batch: Batch, viewer: BatchViewer): Fact[] {
  const on = (at: Date) => formatInstantDate(at, viewer.zone)
  const facts: Fact[] = [
    { label: 'Proposed', value: `${viewer.nameOf(batch.proposedBy)}, ${on(batch.proposedAt)}` },
  ]
  if (batch.approvedBy !== null && batch.approvedAt !== null) {
    facts.push({
      label: 'Approved',
      value: `${viewer.nameOf(batch.approvedBy)}, ${on(batch.approvedAt)}`,
    })
  }
  if (batch.executedAt !== null) facts.push({ label: 'Carried out', value: on(batch.executedAt) })
  if (batch.cancelledAt !== null) facts.push({ label: 'Cancelled', value: on(batch.cancelledAt) })
  return facts
}

function Actions({ batch, viewer }: { batch: Batch; viewer: BatchViewer }) {
  const proposed = batch.status === 'proposed'
  const ownProposal = batch.proposedBy === viewer.userId
  const cancellable = proposed || batch.status === 'approved'
  if (!cancellable) return null
  return (
    <div className="rail-card">
      {proposed ? (
        <NextStep>
          <p>{approvalNote(viewer.mayApprove, ownProposal)}</p>
          {viewer.mayApprove && !ownProposal ? (
            <ActionForm action={approveDispositionAction} submitLabel="Approve and carry out">
              <input type="hidden" name="batchId" value={batch.id} />
              <p className="m-0">
                Approving permanently deletes these records. Holds placed since the proposal are
                respected.
              </p>
            </ActionForm>
          ) : null}
        </NextStep>
      ) : null}
      <details>
        <summary>Cancel the batch</summary>
        <ActionForm action={cancelDispositionAction} submitLabel="Cancel batch">
          <input type="hidden" name="batchId" value={batch.id} />
          <p className="m-0">Nothing in the batch is disposed of.</p>
        </ActionForm>
      </details>
    </div>
  )
}

export function BatchRail({ batch, viewer }: { batch: Batch; viewer: BatchViewer }) {
  return (
    <>
      <Actions batch={batch} viewer={viewer} />
      <div className="rail-card">
        <FactList facts={batchFacts(batch, viewer)} stacked />
      </div>
    </>
  )
}
