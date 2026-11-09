// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReportReceived, reportReference } from '@/components/public/ReportReceived'

afterEach(cleanup)

describe('ReportReceived', () => {
  it('shows the reference in large text and what happens next', () => {
    render(<ReportReceived reference="CP-2027-0001" reply="contact" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Report received' })).toBeTruthy()
    const reference = screen.getByText('CP-2027-0001')
    expect(reference.className).toContain('text-4xl')
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeTruthy()
  })

  it('says staff may reply when contact details were left', () => {
    render(<ReportReceived reference="CP-2027-0001" reply="contact" />)
    expect(document.body.textContent).toContain(
      'Town staff may contact you at the email or phone you gave if they have questions.',
    )
  })

  it('says staff cannot reply when no contact details were left', () => {
    render(<ReportReceived reference="CP-2027-0001" reply="none" />)
    expect(document.body.textContent).toContain(
      'You left no email or phone, so town staff cannot reply to you.',
    )
  })

  it('says an anonymous sender cannot be replied to', () => {
    render(<ReportReceived reference={null} reply="anonymous" />)
    expect(document.body.textContent).toContain(
      'The town does not know who sent it, so it cannot reply to you.',
    )
    expect(screen.queryByText(/Your reference/)).toBeNull()
  })

  it('accepts only a complaint number as the reference', () => {
    expect(reportReference('CP-2027-0001')).toBe('CP-2027-0001')
    expect(reportReference('<b>x</b>')).toBeNull()
    expect(reportReference(['CP-2027-0001'])).toBeNull()
    expect(reportReference(undefined)).toBeNull()
  })
})
