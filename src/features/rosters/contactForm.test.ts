import { describe, expect, it } from 'vitest'
import { officersFrom, tenantsFrom } from '@/features/rosters/contactForm'

function form(rows: Record<string, string>[]): FormData {
  const f = new FormData()
  for (const row of rows) for (const [k, v] of Object.entries(row)) f.append(k, v)
  return f
}

describe('officersFrom', () => {
  it('reads one officer per row and drops rows left blank', () => {
    const f = form([
      { officerName: 'Dana Whitcomb', officerTitle: 'President', officerAddress: 'PO Box 105' },
      { officerName: ' ', officerTitle: '', officerAddress: '' },
      { officerName: 'Lee Marsh', officerTitle: '', officerAddress: '12 Loon Road' },
    ])
    expect(officersFrom(f)).toEqual([
      { name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' },
      { name: 'Lee Marsh', title: '', mailingAddress: '12 Loon Road' },
    ])
  })

  it('keeps a half-filled row so the save can refuse it', () => {
    const f = form([{ officerName: 'Dana Whitcomb', officerTitle: '', officerAddress: '' }])
    expect(officersFrom(f)).toEqual([{ name: 'Dana Whitcomb', title: '', mailingAddress: '' }])
  })
})

describe('tenantsFrom', () => {
  it('keeps the id of a tenant already on file so lists still match it', () => {
    const f = form([
      { tenantId: 's4', tenantName: 'Rory Pike', tenantSite: 'Lot 4', tenantAddress: '4 Court' },
    ])
    expect(tenantsFrom(f)).toEqual([
      { tenantId: 's4', name: 'Rory Pike', siteLabel: 'Lot 4', mailingAddress: '4 Court' },
    ])
  })

  it('names a new tenant after its site, as the old text field did, and keeps ids unique', () => {
    const f = form([
      { tenantId: 'site-4', tenantName: 'Rory Pike', tenantSite: 'Site 4', tenantAddress: 'A' },
      { tenantId: '', tenantName: 'Ines Thorne', tenantSite: 'Site 4', tenantAddress: 'B' },
      { tenantId: '', tenantName: 'Cass Pryor', tenantSite: '', tenantAddress: 'C' },
    ])
    expect(tenantsFrom(f).map((t) => t.tenantId)).toEqual(['site-4', 'site-4-2', 'tenant-3'])
  })
})
