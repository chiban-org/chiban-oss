// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'

afterEach(cleanup)

describe('BalanceDueNotice', () => {
  it('renders nothing when there is no balance from a returned check', () => {
    const { container } = render(<BalanceDueNotice notices={[]} />)
    expect(container.textContent).toBe('')
  })

  it('states the amount in dollars and the reason in words', () => {
    render(
      <BalanceDueNotice
        notices={[{ applicationId: 'a', number: 'EL-2027-0001', dueCents: 4500 }]}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('Balance due $45.00 (returned check)')
  })

  it('links to the application when asked to name it', () => {
    render(
      <BalanceDueNotice
        notices={[{ applicationId: 'a', number: 'EL-2027-0001', dueCents: 4500 }]}
        linkApplications
      />,
    )
    expect(screen.getByRole('link', { name: 'EL-2027-0001' }).getAttribute('href')).toBe(
      '/staff/applications/a',
    )
  })
})
