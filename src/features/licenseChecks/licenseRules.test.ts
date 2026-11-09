import { describe, expect, it } from 'vitest'
import { licenseCheckApplies, licenseGateOutcome } from './licenseRules'

const check = (result: 'active' | 'not_found' | 'expired' | 'inactive', note: string | null) => ({
  result,
  licenseNumber: 'EL-20418',
  note,
})

describe('which applications need a state license check', () => {
  it('a trade permit done by a contractor needs one', () => {
    expect(
      licenseCheckApplies({ classification: 'nh.trade_permit', values: { work_by: 'contractor' } }),
    ).toBe(true)
  })

  it('a trade permit that does not say who does the work needs one', () => {
    expect(licenseCheckApplies({ classification: 'nh.trade_permit', values: {} })).toBe(true)
  })

  it('owner-performed trade work skips the check', () => {
    expect(
      licenseCheckApplies({ classification: 'nh.trade_permit', values: { work_by: 'owner' } }),
    ).toBe(false)
  })

  it('a building permit never needs one', () => {
    expect(licenseCheckApplies({ classification: 'nh.building_permit', values: {} })).toBe(false)
  })
})

describe('the license gate outcome', () => {
  it('blocks when no check is recorded', () => {
    expect(licenseGateOutcome(null)).toEqual({
      status: 'blocked',
      reason: 'No state license check is recorded.',
    })
  })

  it('passes when the latest check found the license active', () => {
    expect(licenseGateOutcome(check('active', null))).toEqual({ status: 'pass' })
  })

  it('blocks with the result and note when the latest check failed', () => {
    expect(licenseGateOutcome(check('expired', 'Lapsed in June'))).toEqual({
      status: 'blocked',
      reason: 'The latest state license check found license EL-20418 expired. Lapsed in June.',
    })
  })

  it('reads a not found result in plain words', () => {
    expect(licenseGateOutcome(check('not_found', null))).toEqual({
      status: 'blocked',
      reason: 'The latest state license check found license EL-20418 not found.',
    })
  })
})
