import { describe, expect, it } from 'vitest'
import {
  officerLines,
  parseOfficers,
  parseTenants,
  tenantLines,
} from '@/features/rosters/parseLines'

const officers = [
  { name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105, Alder Pond NH 03999' },
  { name: 'Lee Marsh', title: 'Treasurer', mailingAddress: '12 Loon Road, Alder Pond NH 03999' },
]

const tenants = [
  {
    tenantId: 'site-4',
    name: 'Rory Pike',
    siteLabel: 'Site 4',
    mailingAddress: '4 Merganser Court, Alder Pond NH 03999',
  },
]

describe('roster lines for editing', () => {
  it('writes officers back in the form the field reads', () => {
    expect(officerLines(officers)).toBe(
      'Dana Whitcomb | President | PO Box 105, Alder Pond NH 03999\nLee Marsh | Treasurer | 12 Loon Road, Alder Pond NH 03999',
    )
    expect(parseOfficers(officerLines(officers))).toEqual(officers)
  })

  it('keeps each tenant and its site when the lines are saved again', () => {
    expect(parseTenants(tenantLines(tenants))).toEqual(tenants)
  })

  it('keeps one officer on one line when an address held a line break or a bar', () => {
    const odd = [{ name: 'Sam Reed', title: 'Clerk', mailingAddress: 'Unit 3 | Rear\n1 Elm St' }]
    expect(officerLines(odd)).toBe('Sam Reed | Clerk | Unit 3 Rear 1 Elm St')
    expect(parseOfficers(officerLines(odd))).toHaveLength(1)
  })
})
