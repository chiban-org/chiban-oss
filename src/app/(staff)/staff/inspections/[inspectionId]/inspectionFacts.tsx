import Link from 'next/link'
import type { Fact } from '@/components/layout/PageHeader'
import type { InspectionCancelReason, InspectionChannel } from '@/db/schema'
import type { CancelFacts } from '@/features/inspections/inspectionPlan'
import type { InspectionRecord } from '@/features/inspections/inspectionRecord'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'

const CHANNEL: Record<InspectionChannel, string> = {
  phone: 'By phone',
  counter: 'At the counter',
  portal: 'Online',
}

const CANCEL_REASON: Record<InspectionCancelReason, string> = {
  requester: 'The requester cancelled it',
  staff: 'Town staff cancelled it',
  permit_suspended: 'The permit was suspended',
  permit_expired: 'The permit expired',
  permit_closed: 'The permit closed',
}

function contactValue(record: InspectionRecord) {
  const { inspection, showContactPhone } = record.view
  if (inspection.contactPhone === null || !showContactPhone) return inspection.contactName
  return (
    <>
      {inspection.contactName}
      <br />
      <a href={`tel:${inspection.contactPhone.replace(/[^\d+]/g, '')}`}>
        {inspection.contactPhone}
      </a>
    </>
  )
}

function whenValue(record: InspectionRecord): string {
  const { scheduledDate, startMinute } = record.view.inspection
  if (scheduledDate === null || startMinute === null) return 'Not scheduled yet'
  return `${formatCivilDate(scheduledDate)} at ${minutesToClock(startMinute)}`
}

function requestFacts(record: InspectionRecord): Fact[] {
  const { inspection } = record.view
  if (inspection.status !== 'requested') return []
  return [
    {
      label: 'Preferred day',
      value:
        inspection.preferredDate === null ? 'Any day' : formatCivilDate(inspection.preferredDate),
    },
    { label: 'How it was requested', value: CHANNEL[inspection.channel] },
  ]
}

export function inspectionFacts(record: InspectionRecord): Fact[] {
  const { view, previousId } = record
  const { inspection } = view
  const facts: Fact[] = [
    {
      label: 'Permit',
      value: (
        <Link href={`/staff/applications/${inspection.applicationId}`}>
          {view.applicationNumber}
        </Link>
      ),
    },
    { label: 'Inspector', value: view.inspectorName ?? 'Not assigned yet' },
    { label: 'When', value: whenValue(record) },
    ...requestFacts(record),
    { label: 'Contact', value: contactValue(record) },
  ]
  if (inspection.accessNotes !== null)
    facts.push({ label: 'Access', value: inspection.accessNotes })
  if (previousId !== null) {
    facts.push({
      label: 'Reinspection of',
      value: <Link href={`/staff/inspections/${previousId}`}>The failed inspection</Link>,
    })
  }
  return facts
}

export function cancelFactList(cancel: CancelFacts): Fact[] {
  const facts: Fact[] = []
  if (cancel.reason !== null) facts.push({ label: 'Reason', value: CANCEL_REASON[cancel.reason] })
  if (cancel.on !== null) {
    facts.push({ label: 'Cancelled by', value: cancel.byName ?? 'Automatically' })
    facts.push({ label: 'Cancelled on', value: formatCivilDate(cancel.on) })
  }
  return facts
}
