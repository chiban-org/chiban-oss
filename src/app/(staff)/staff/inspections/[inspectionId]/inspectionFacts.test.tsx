import { describe, expect, it } from 'vitest'
import type { InspectionRecord } from '@/features/inspections/inspectionRecord'
import { inspectionFacts } from './inspectionFacts'

function recordWith(offGridReason: string | null): InspectionRecord {
  return {
    previousId: null,
    view: {
      applicationNumber: 'EL-2027-0001',
      inspectorName: 'Dana Inspector',
      showContactPhone: false,
      inspection: {
        applicationId: 'a1',
        status: 'scheduled',
        scheduledDate: '2027-07-13',
        startMinute: 600,
        contactName: 'Pat',
        contactPhone: null,
        accessNotes: null,
        offGridReason,
      },
    },
  } as unknown as InspectionRecord
}

const labels = (record: InspectionRecord) => inspectionFacts(record).map((f) => f.label)

describe('the inspection facts', () => {
  it('show the reason a booking was made outside the town slots', () => {
    const fact = inspectionFacts(recordWith('Inspector is free that Tuesday')).find(
      (f) => f.label === 'Booked outside the town slots',
    )
    expect(fact?.value).toBe('Inspector is free that Tuesday')
  })

  it('leave the reason out for a booking in a town slot', () => {
    expect(labels(recordWith(null))).not.toContain('Booked outside the town slots')
  })
})
