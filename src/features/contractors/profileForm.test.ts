import { describe, expect, it } from 'vitest'
import { ContractorForm, PersonForm } from '@/features/contractors/profileForm'

const BASE = {
  companyName: 'Builder and Sons',
  name: 'Pat Builder',
  phone: '603-555-0142',
  mailingAddress: '',
}

describe('contractor profile form', () => {
  it('reads several trades and keeps only the license numbers that were entered', () => {
    const parsed = ContractorForm.parse({
      ...BASE,
      trades: ['plumbing', 'electrical'],
      license_electrical: ' EL-20418 ',
      license_plumbing: '',
    })
    expect(parsed).toEqual({
      ...BASE,
      mailingAddress: null,
      trades: ['electrical', 'plumbing'],
      licenses: [{ trade: 'electrical', number: 'EL-20418' }],
    })
  })

  it('counts a trade with a license number as chosen even when its box was left clear', () => {
    const parsed = ContractorForm.parse({ ...BASE, license_fuelGas: 'GF-9921' })
    expect(parsed.trades).toEqual(['fuelGas'])
  })

  it('accepts no trade at all for a builder without a state license', () => {
    expect(ContractorForm.parse({ ...BASE, trades: undefined }).trades).toEqual([])
  })

  it('refuses an unknown trade, a missing company, and a missing phone', () => {
    expect(ContractorForm.safeParse({ ...BASE, trades: 'roofing' }).success).toBe(false)
    const missing = ContractorForm.safeParse({ ...BASE, companyName: ' ', phone: '' })
    expect(missing.success).toBe(false)
    expect(missing.error?.issues.map((i) => i.path[0]).sort()).toEqual(['companyName', 'phone'])
  })
})

describe('person form', () => {
  it('needs only a name', () => {
    expect(PersonForm.parse({ name: 'Morgan Reyes', phone: '', mailingAddress: '' })).toEqual({
      name: 'Morgan Reyes',
      phone: null,
      mailingAddress: null,
    })
    expect(PersonForm.safeParse({ name: '' }).success).toBe(false)
  })
})
