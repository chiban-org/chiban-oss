import { describe, expect, it } from 'vitest'
import { portalInspectionLabel } from '@/features/portal/inspectionLabel'

describe('portalInspectionLabel', () => {
  it('reads a scheduled inspection whose day has passed as result pending', () => {
    expect(
      portalInspectionLabel({ status: 'scheduled', scheduledDate: '2027-07-01' }, '2027-07-02'),
    ).toEqual({
      chip: 'neutral',
      label: 'Result pending',
    })
    expect(
      portalInspectionLabel({ status: 'scheduled', scheduledDate: '2027-07-02' }, '2027-07-02')
        .label,
    ).toBe('Scheduled')
    expect(portalInspectionLabel({ status: 'failed', scheduledDate: null }, '2027-07-02')).toEqual({
      chip: 'failed',
      label: 'Failed',
    })
  })
})
