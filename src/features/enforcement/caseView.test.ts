import { describe, expect, it } from 'vitest'
import type { Role } from '@/constants/roles'
import { type CaseViewInput, caseViewFor, counselReferralApplies } from './caseView'

const FIELD_GRANTS = { manages: true, recordsService: true, refersCounsel: false }

function input(roles: Role[], overrides: Partial<CaseViewInput> = {}): CaseViewInput {
  return { roles, ...FIELD_GRANTS, assigned: false, ...overrides }
}

describe('which case page a viewer gets', () => {
  it('an inspector who records service and is not assigned the case gets the field view', () => {
    expect(caseViewFor(input(['inspector']))).toBe('field')
  })

  it('the inspector assigned to the case owns it and gets the office page', () => {
    expect(caseViewFor(input(['inspector'], { assigned: true }))).toBe('office')
  })

  it('an inspector who also holds the staff role keeps the office page', () => {
    expect(caseViewFor(input(['inspector', 'staff']))).toBe('office')
  })

  it('an inspector without the service capability keeps the office page', () => {
    expect(caseViewFor(input(['inspector'], { recordsService: false }))).toBe('office')
  })

  it('office staff get the office page whether or not they are assigned', () => {
    expect(caseViewFor(input(['staff'], { refersCounsel: true }))).toBe('office')
    expect(caseViewFor(input(['staff'], { refersCounsel: true, assigned: true }))).toBe('office')
  })

  it('someone who refers to counsel but neither manages the case nor records service gets the counsel view', () => {
    expect(
      caseViewFor(input(['admin'], { manages: false, recordsService: false, refersCounsel: true })),
    ).toBe('counsel')
  })

  it('finance, who neither refers to counsel nor manages the case, keeps the office page', () => {
    expect(
      caseViewFor(
        input(['finance'], { manages: false, recordsService: false, refersCounsel: false }),
      ),
    ).toBe('office')
  })
})

describe('when the plan lets a counsel referral apply', () => {
  it('applies while an order is in force and no appeal stays it', () => {
    expect(counselReferralApplies({ status: 'order_issued', stayed: false })).toBe(true)
    expect(counselReferralApplies({ status: 'in_court', stayed: false })).toBe(true)
    expect(counselReferralApplies({ status: 'in_court', stayed: true })).toBe(false)
    expect(counselReferralApplies({ status: 'violation_found', stayed: false })).toBe(false)
    expect(counselReferralApplies({ status: 'resolved', stayed: false })).toBe(false)
  })
})
