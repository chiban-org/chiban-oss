import { Clock } from 'lucide-react'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { FactList } from '@/components/layout/PageHeader'
import type { InspectionRecord } from '@/features/inspections/inspectionRecord'
import { cancelInspectionAction } from '../actions'
import { inspectionFacts } from './inspectionFacts'

const LISTED_STATUSES: readonly string[] = ['scheduled', 'passed', 'failed']

function opensForScheduling(record: InspectionRecord): boolean {
  const { status } = record.view.inspection
  return record.maySchedule && (status === 'requested' || status === 'scheduled')
}

export function InspectionMoreActions({ record }: { record: InspectionRecord }) {
  if (!opensForScheduling(record)) return null
  const { view } = record
  const { inspection } = view
  return (
    <details className="more-actions">
      <summary className="text-sm">More actions</summary>
      <div className="flex flex-col gap-3">
        {inspection.status === 'scheduled' ? (
          <p>
            <Link href={`/staff/inspections?request=${inspection.id}`}>Reschedule</Link>
          </p>
        ) : null}
        <ActionForm
          action={cancelInspectionAction}
          submitLabel="Cancel this inspection"
          variant="destructive"
          compact
          confirm={{
            title: `Cancel the ${view.name} for ${view.applicationNumber}?`,
            body: 'The inspection is cancelled and the permit holder is told. Request a new one if it is still needed.',
            confirmLabel: 'Cancel the inspection',
            cancelLabel: 'Keep the inspection',
          }}
        >
          <input type="hidden" name="inspectionId" value={inspection.id} />
          <input type="hidden" name="expectedRowVersion" value={inspection.rowVersion} />
        </ActionForm>
      </div>
    </details>
  )
}

function PublicLine({ record }: { record: InspectionRecord }) {
  if (!LISTED_STATUSES.includes(record.view.inspection.status)) return null
  return (
    <p className="text-sm text-muted-foreground">
      The public parcel page lists this inspection with its number, type, status and dates.
    </p>
  )
}

export function InspectionRail({ record }: { record: InspectionRecord }) {
  return (
    <>
      {opensForScheduling(record) ? (
        <div className="rail-card">
          <InspectionMoreActions record={record} />
        </div>
      ) : null}
      <section aria-label="Key facts" data-plain className="rail-card space-y-3">
        <FactList facts={inspectionFacts(record)} stacked />
        <PublicLine record={record} />
      </section>
    </>
  )
}

export function OwedLine({ owed }: { owed: string | null }) {
  if (owed === null) return null
  return (
    <p
      data-slot="result-owed"
      className="flex items-center gap-2 font-semibold text-status-overdue-fg"
    >
      <Clock className="size-4 shrink-0" aria-hidden={true} />
      <span>{owed}</span>
    </p>
  )
}

export function InspectionStrip({ record }: { record: InspectionRecord }) {
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <OwedLine owed={record.plan.owed} />
      <details>
        <summary className="text-sm">Facts and more actions</summary>
        <div className="flex flex-col gap-4">
          <FactList facts={inspectionFacts(record)} stacked />
          <PublicLine record={record} />
          <InspectionMoreActions record={record} />
        </div>
      </details>
    </section>
  )
}
