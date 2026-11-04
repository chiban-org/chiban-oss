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
            applicationNumber: 'BP-2028-0007',
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
            applicationNumber: 'BP-2028-0007',
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
            applicationNumber: 'BP-2028-0007',
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

  it('links the application by its number and names the adjustment', () => {
    const { container } = render(
      <ClockAdjustmentsTable
        rows={[
          {
            id: 'a',
            applicationId: 'b',
            applicationNumber: 'BP-2028-0007',
            ruleKey: 'k',
            kind: 'statutory_exception',
            days: 14,
            newDue: null,
            reason: 'r',
            legalAuthority: null,
            status: 'applied',
          },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: 'BP-2028-0007' })
    expect(link.getAttribute('href')).toBe('/staff/applications/b')
    expect(screen.getByText('Statutory exception, 14 days')).toBeTruthy()
    expect(container.textContent).not.toContain('View application')
    expect(container.querySelector('.table-panel')).not.toBeNull()
  })
})
