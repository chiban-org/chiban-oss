import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import type { dispositionBatches } from '@/db/schema'
import { BATCH_CHIP, BATCH_STATUS_LABELS } from '@/features/disposition/batchStatus'
import { formatCivilDate, formatInstantLong } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { proposeDispositionAction } from './actions'

type Batch = typeof dispositionBatches.$inferSelect

export function BatchesSection({
  batches,
  more,
  allHref,
  zone,
  today,
}: {
  batches: Batch[]
  more: boolean
  allHref: string
  zone: string
  today: CivilDate
}) {
  return (
    <section aria-labelledby="batches" data-plain className="space-y-3">
      <h2 id="batches">Disposition batches</h2>
      <p>
        Newest first. <Link href="/staff/records/disposed">Disposed records</Link> lists every
        record already disposed of, with its tombstone.
      </p>
      <details>
        <summary>Propose a batch</summary>
        <ActionForm action={proposeDispositionAction} submitLabel="Propose batch">
          <TextField
            label="Records eligible on or before"
            name="asOf"
            type="date"
            defaultValue={today}
            required
          />
        </ActionForm>
      </details>
      {batches.length === 0 ? (
        <p>No batch has been proposed yet.</p>
      ) : (
        <div className="table-panel">
          <table className="w-full min-w-[32rem] text-left">
            <thead>
              <tr>
                <th scope="col">As of</th>
                <th scope="col">Status</th>
                <th scope="col">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/staff/records/disposition/${b.id}`}>
                      {formatCivilDate(b.asOf)}
                    </Link>
                  </td>
                  <td>
                    <StatusChip
                      status={BATCH_CHIP[b.status]}
                      label={BATCH_STATUS_LABELS[b.status]}
                    />
                  </td>
                  <td className="whitespace-nowrap">{formatInstantLong(b.proposedAt, zone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more ? <Link href={allHref}>Show every batch</Link> : null}
    </section>
  )
}
