import Link from 'next/link'
import { FactList } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { inspectionName, slotText } from '@/features/inspections/inspectorFocus'
import type { LotInspection } from '@/features/parcels/lotInspection'
import type { ParcelPageData } from './parcelPageData'

function inspectionHref(next: LotInspection): string {
  return `/staff/inspections/${next.id}`
}

function PermitLink({ next }: { next: LotInspection }) {
  return <Link href={`/staff/applications/${next.applicationId}`}>{next.number}</Link>
}

function NextStep({ data, next }: { data: ParcelPageData; next: LotInspection }) {
  const due = next.scheduledDate !== null && next.scheduledDate <= data.today
  if (data.recordsNext && due) {
    return (
      <Button asChild className="self-start">
        <Link href={inspectionHref(next)}>Record the result</Link>
      </Button>
    )
  }
  return (
    <>
      {data.recordsNext ? (
        <p role="status">This inspection can be recorded on or after its scheduled date.</p>
      ) : null}
      <p>
        <Link href={inspectionHref(next)}>Open the inspection</Link>
      </p>
    </>
  )
}

export function NextInspectionLead({ data }: { data: ParcelPageData }) {
  const next = data.next
  if (next === null) return null
  return (
    <div data-slot="next-inspection" className="record-item flex flex-col gap-2 [&>*]:m-0">
      <p className="text-sm font-semibold text-muted-foreground">Next inspection</p>
      <p>
        <span className="font-semibold">{inspectionName(next)}</span>
        {`, ${slotText(next, data.today)}, on `}
        <PermitLink next={next} />
      </p>
      <NextStep data={data} next={next} />
    </div>
  )
}

function Contact({ next }: { next: LotInspection }) {
  return (
    <>
      <span className="block">{next.contactName}</span>
      {next.contactPhone === null ? null : (
        <a className="tap-target" href={`tel:${next.contactPhone.replace(/[^\d+]/g, '')}`}>
          {next.contactPhone}
        </a>
      )}
    </>
  )
}

export function FieldNextInspection({ data }: { data: ParcelPageData }) {
  const next = data.next
  return (
    <section
      id="next-inspection"
      aria-labelledby="next-inspection-heading"
      className="flex flex-col gap-3 [&>*]:m-0"
    >
      <h2 id="next-inspection-heading">Next inspection on this lot</h2>
      {next === null ? (
        <p>No inspection is scheduled on this lot.</p>
      ) : (
        <>
          <p className="font-serif text-xl font-semibold text-ink">{inspectionName(next)}</p>
          <p className="text-ink-secondary">{slotText(next, data.today)}</p>
          <FactList
            stacked
            facts={[
              { label: 'Permit', value: <PermitLink next={next} /> },
              { label: 'Inspector', value: next.inspectorName ?? 'Not assigned yet' },
              { label: 'Contact', value: <Contact next={next} /> },
              { label: 'Access notes', value: next.accessNotes ?? 'None' },
            ]}
          />
          <NextStep data={data} next={next} />
        </>
      )}
    </section>
  )
}
