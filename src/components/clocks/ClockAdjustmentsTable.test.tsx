// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ClockAdjustmentsTable } from '@/components/clocks/ClockAdjustmentsTable'

afterEach(cleanup)

describe('ClockAdjustmentsTable', () => {
  it('shows the new due date in words', () => {
    render(
      <ClockAdjustmentsTable
        rows={[
          {
            id: 'a',
            applicationId: 'b',
            ruleKey: 'nh.bp.decision',
            kind: 'extension',
            days: 14,
            newDue: '2028-05-28',
            reason: 'Applicant asked',
            legalAuthority: null,
            status: 'applied',
          },
        ]}
      />,
    )
    expect(screen.getByText('May 28, 2028')).toBeTruthy()
    expect(screen.queryByText('2028-05-28')).toBeNull()
  })

  it('says unchanged when no date moved', () => {
    render(
      <ClockAdjustmentsTable
        rows={[
          {
            id: 'a',
            applicationId: 'b',
            ruleKey: 'k',
            kind: 'waiver',
            days: null,
            newDue: null,
            reason: 'r',
            legalAuthority: null,
            status: 'applied',
          },
        ]}
      />,
    )
    expect(screen.getByText('Unchanged')).toBeTruthy()
  })

  it('names the rule instead of showing its key', () => {
    const { container } = render(
      <ClockAdjustmentsTable
        rows={[
          {
            id: 'a',
            applicationId: 'b',
            ruleKey: 'town.bp.expiration',
            kind: 'renewal',
            days: null,
            newDue: '2027-05-28',
            reason: 'Permit renewed',
            legalAuthority: null,
            status: 'applied',
          },
        ]}
      />,
    )
    expect(screen.getByText('Building permit exercise-by date')).toBeTruthy()
    expect(container.textContent).not.toContain('town.bp.expiration')
  })
})
