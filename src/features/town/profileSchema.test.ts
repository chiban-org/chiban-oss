import { describe, expect, it } from 'vitest'
import { checkTownProfile } from '@/features/town/profileChecks'
import {
  TOWN_PROFILE_SKELETON,
  type TownProfileBody,
  TownProfileBodySchema,
} from '@/features/town/profileSchema'

const SHA = 'a'.repeat(64)

const FULL: TownProfileBody = {
  ...TOWN_PROFILE_SKELETON,
  officeName: 'Land Use Office',
  addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
  phone: '603-555-0100',
  email: 'landuse@alderpond.example',
  website: 'https://alderpond.example',
  officeHours: 'Monday to Thursday, 8 to 4',
  logo: { objectKey: `town-assets/${SHA}`, contentType: 'image/png', width: 240, height: 240 },
  boardOverrides: {
    '22222222-2222-4222-8222-222222222222': { officeName: 'Zoning Board of Adjustment' },
  },
  signers: [
    {
      role: 'building_official',
      name: 'Ira Inspector',
      title: 'Building Official',
      signature: null,
    },
  ],
}

function issuesOf(body: unknown): string[] {
  const parsed = TownProfileBodySchema.safeParse(body)
  return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'))
}

describe('town profile schema', () => {
  it('accepts a full profile', () => {
    expect(issuesOf(FULL)).toEqual([])
  })

  it('needs one to three address lines', () => {
    expect(issuesOf({ ...FULL, addressLines: [] })).toEqual(['addressLines'])
    expect(issuesOf({ ...FULL, addressLines: ['a', 'b', 'c', 'd'] })).toEqual(['addressLines'])
  })

  it('refuses a malformed email and a non-web address', () => {
    expect(issuesOf({ ...FULL, email: 'not an email' })).toEqual(['email'])
    expect(issuesOf({ ...FULL, website: 'javascript:alert(1)' })).toEqual(['website'])
  })

  it('allows the contact lines to be left empty', () => {
    expect(issuesOf({ ...FULL, phone: '', email: '', website: '', officeHours: '' })).toEqual([])
  })

  it('refuses an image key outside the town asset area', () => {
    const logo = { ...FULL.logo, objectKey: `blobs/sha256/aa/aa/${SHA}` }
    expect(issuesOf({ ...FULL, logo })).toEqual(['logo.objectKey'])
  })

  it('refuses an override for a board the town does not have', () => {
    expect(issuesOf({ ...FULL, boardOverrides: { select_board: {} } })).not.toEqual([])
  })

  it('refuses an unknown signer role', () => {
    const signers = [{ role: 'mayor', name: 'A', title: 'B', signature: null }]
    expect(issuesOf({ ...FULL, signers })).toEqual(['signers.0.role'])
  })
})

describe('town profile publish checks', () => {
  it('passes a profile with one signer per role', () => {
    expect(checkTownProfile(FULL)).toBeNull()
  })

  it('refuses two signers for the same role', () => {
    const signer = FULL.signers[0]
    if (signer === undefined) throw new Error('fixture has a signer')
    const result = checkTownProfile({ ...FULL, signers: [signer, { ...signer, name: 'Other' }] })
    expect(result).toEqual({
      invalid: [{ path: 'signers.1.role', message: 'Building official is listed twice.' }],
    })
  })
})
