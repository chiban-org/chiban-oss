import { describe, expect, it } from 'vitest'
import { ownerHref, staffRecordHref } from '@/features/records/staffRecordLinks'

describe('staffRecordHref', () => {
  it('links each kind of record to its staff page', () => {
    expect(staffRecordHref('application', 'a1')).toBe('/staff/applications/a1')
    expect(staffRecordHref('enforcement_case', 'c1')).toBe('/staff/enforcement/c1')
    expect(staffRecordHref('rtk_request', 'r1')).toBe('/staff/records/requests/r1')
    expect(staffRecordHref('parcel', 'p1')).toBe('/staff/parcels/p1')
    expect(staffRecordHref('inspection', 'i1')).toBe('/staff/inspections/i1')
    expect(staffRecordHref('meeting', 'm1')).toBe('/staff/boards/meetings/m1')
  })

  it('has no link for a kind without a staff page or a missing id', () => {
    expect(staffRecordHref('demo_record', 'x')).toBeNull()
    expect(staffRecordHref('parcel', null)).toBeNull()
  })
})

describe('ownerHref', () => {
  it('sends a project document to the parcel the project sits on', () => {
    expect(ownerHref({ recordKind: 'project', recordId: 'pr1', projectParcelId: 'p9' })).toBe(
      '/staff/parcels/p9',
    )
    expect(ownerHref({ recordKind: 'project', recordId: 'pr1', projectParcelId: null })).toBeNull()
    expect(ownerHref({ recordKind: 'application', recordId: 'a1', projectParcelId: null })).toBe(
      '/staff/applications/a1',
    )
  })
})
