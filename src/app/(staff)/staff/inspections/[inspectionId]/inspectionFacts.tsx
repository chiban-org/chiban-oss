import type { Fact } from '@/components/layout/PageHeader'
import type { InspectionView } from '@/features/inspections/inspectionView'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'

export function inspectionFacts(view: InspectionView, linkClass: string): Fact[] {
  const { inspection } = view
  const facts: Fact[] = []
  if (inspection.scheduledDate !== null && inspection.startMinute !== null) {
    facts.push({
      label: 'When',
      value: `${formatCivilDate(inspection.scheduledDate)} at ${minutesToClock(inspection.startMinute)}`,
    })
  }
  facts.push({
    label: 'Contact',
    value:
      inspection.contactPhone === null ? (
        inspection.contactName
      ) : (
        <>
          {inspection.contactName}
          <br />
          <a className={linkClass} href={`tel:${inspection.contactPhone.replace(/[^\d+]/g, '')}`}>
            {inspection.contactPhone}
          </a>
        </>
      ),
  })
  if (inspection.accessNotes !== null)
    facts.push({ label: 'Access', value: inspection.accessNotes })
  return facts
}
