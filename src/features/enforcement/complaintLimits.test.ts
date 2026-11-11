import { beforeEach, describe, expect, it } from 'vitest'
import { resetComplaintLimits, takeComplaintAllowance } from './complaintLimits'

beforeEach(() => {
  resetComplaintLimits()
})

describe('takeComplaintAllowance', () => {
  it('allows five reports from one client and refuses the sixth', () => {
    for (let i = 0; i < 5; i += 1) expect(takeComplaintAllowance('client-a')).toBe(true)
    expect(takeComplaintAllowance('client-a')).toBe(false)
  })

  it('keeps budgets separate per client', () => {
    for (let i = 0; i < 5; i += 1) takeComplaintAllowance('client-a')
    expect(takeComplaintAllowance('client-b')).toBe(true)
  })

  it('starts fresh after a reset', () => {
    for (let i = 0; i < 6; i += 1) takeComplaintAllowance('client-a')
    resetComplaintLimits()
    expect(takeComplaintAllowance('client-a')).toBe(true)
  })
})
