import { describe, expect, it } from 'vitest'
import { applicationStatusText } from '@/features/applications/statusText'
import { partyLine, partyRoleLabel } from '@/features/projects/partyRoleLabels'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'

const declared = [{ key: 'co_pending', label: 'Certificate of occupancy pending' }]

describe('applicationStatusText', () => {
  it('uses the declared substep label in lower case after the state label', () => {
    expect(applicationStatusText('issued', 'co_pending', declared)).toBe(
      'Issued, certificate of occupancy pending',
    )
  })

  it('falls back to readable words for an undeclared substep', () => {
    expect(applicationStatusText('under_review', 'plan_review', [])).toBe(
      'Under review, plan review',
    )
  })

  it('shows only the state when there is no substep', () => {
    expect(applicationStatusText('submitted', null, declared)).toBe('Submitted')
  })
})

describe('reviewStatusLabel', () => {
  it('labels every review status', () => {
    expect(reviewStatusLabel('pending')).toBe('Pending')
    expect(reviewStatusLabel('commented')).toBe('Commented')
    expect(reviewStatusLabel('signed_off')).toBe('Signed off')
  })
})

describe('party role labels', () => {
  it('labels each role', () => {
    expect(partyRoleLabel('applicant')).toBe('Applicant')
    expect(partyRoleLabel('owner')).toBe('Owner')
  })

  it('shows a name that repeats the role once', () => {
    expect(partyLine('Applicant', 'applicant')).toBe('Applicant')
    expect(partyLine('Pat Smith', 'owner')).toBe('Pat Smith, Owner')
  })
})
