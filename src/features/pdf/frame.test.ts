import { describe, expect, it } from 'vitest'
import { buildFrame, plainFrame } from '@/features/pdf/frame'
import { frameMergeContext } from '@/features/templates/frameFields'
import { renderTemplateText } from '@/features/templates/renderTemplate'
import { TOWN_PROFILE_SKELETON, type TownProfileBody } from '@/features/town/profileSchema'

const LOGO_KEY = `town-assets/${'b'.repeat(64)}`
const PROFILE: TownProfileBody = {
  ...TOWN_PROFILE_SKELETON,
  officeName: 'Land Use Office',
  addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
  phone: '603-555-0100',
  email: 'landuse@alderpond.example',
  website: 'https://alderpond.example',
  officeHours: 'Monday to Thursday, 8 to 4',
  logo: { objectKey: LOGO_KEY, contentType: 'image/png', width: 10, height: 10 },
  letterhead: {
    logoPosition: 'center',
    contactLines: { address: true, phone: true, email: true, website: false, officeHours: true },
    footerText: 'Town of Alder Pond, Land Use Office',
    pageNumbers: true,
  },
  boardOverrides: {
    zba: {
      officeName: 'Zoning Board of Adjustment',
      addressLines: ['Town Hall, Room 2'],
      footerText: 'ZBA decisions may be appealed.',
    },
  },
  signers: [
    { role: 'zba_chair', name: 'Drew Hale', title: 'Chair', signature: null },
    { role: 'town_clerk', name: 'Sam Clerk', title: 'Town Clerk', signature: null },
  ],
}
const LOGO = {
  bytes: new Uint8Array([1]),
  contentType: 'image/png' as const,
  width: 10,
  height: 10,
}

describe('buildFrame', () => {
  it('without a published profile carries only the town name', () => {
    const frame = buildFrame('Town of Alder Pond', null, undefined, new Map())
    expect(frame).toEqual(plainFrame('Town of Alder Pond'))
    expect(frame.headerLines).toEqual([])
  })

  it('shows only the contact lines the letterhead turns on', () => {
    const frame = buildFrame('Town of Alder Pond', PROFILE, undefined, new Map())
    expect(frame.officeName).toBe('Land Use Office')
    expect(frame.headerLines).toEqual([
      '1 Main Street, Alder Pond, NH 03000',
      'Phone 603-555-0100  ·  landuse@alderpond.example',
      'Office hours: Monday to Thursday, 8 to 4',
    ])
    expect(frame.footerText).toBe('Town of Alder Pond, Land Use Office')
    expect(frame.logoPosition).toBe('center')
  })

  it('applies the board override to office, address and footer for that board only', () => {
    const zba = buildFrame('Town of Alder Pond', PROFILE, 'zba', new Map())
    expect(zba.officeName).toBe('Zoning Board of Adjustment')
    expect(zba.headerLines[0]).toBe('Town Hall, Room 2')
    expect(zba.footerText).toBe('ZBA decisions may be appealed.')
    const planning = buildFrame('Town of Alder Pond', PROFILE, 'planning_board', new Map())
    expect(planning.officeName).toBe('Land Use Office')
  })

  it('attaches the logo only when its bytes were loaded', () => {
    expect(buildFrame('T', PROFILE, undefined, new Map()).logo).toBeNull()
    expect(buildFrame('T', PROFILE, undefined, new Map([[LOGO_KEY, LOGO]])).logo).toBe(LOGO)
  })
})

describe('frameMergeContext', () => {
  it('resolves the town, office and signer merge fields', () => {
    const context = frameMergeContext(buildFrame('Town of Alder Pond', PROFILE, 'zba', new Map()))
    const rendered = renderTemplateText(
      '{{office.name}}, {{town.address}}. {{town.phone}} {{town.email}} {{town.website}}. {{signer.zba_chair.name}}, {{signer.zba_chair.title}}. {{signer.building_official.name}}',
      context,
    )
    expect(rendered).toEqual({
      ok: true,
      value:
        'Zoning Board of Adjustment, Town Hall, Room 2. 603-555-0100 landuse@alderpond.example https://alderpond.example. Drew Hale, Chair. Not recorded',
    })
  })
})
