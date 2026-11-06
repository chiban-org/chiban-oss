import { describe, expect, it } from 'vitest'
import { rolesHolding, rolesLacking } from './roles'

describe('roles from the default grants', () => {
  it('lists every role without config.edit, public and grantless roles included', () => {
    expect(rolesLacking('config.edit')).toEqual([
      'staff',
      'inspector',
      'finance',
      'records_custodian',
      'reviewer',
      'board_member',
      'applicant',
      'contractor',
    ])
  })

  it('treats a list of capabilities as any-of, so a role holding one is not refused', () => {
    expect(rolesLacking(['payment.collect', 'disposition.approve'])).toEqual([
      'admin',
      'inspector',
      'reviewer',
      'board_member',
      'applicant',
      'contractor',
    ])
  })

  it('lists the roles that hold a capability', () => {
    expect(rolesHolding('fine.record')).toEqual(['admin', 'finance'])
  })
})
