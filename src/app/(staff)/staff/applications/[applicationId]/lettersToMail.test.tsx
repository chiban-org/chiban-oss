// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LetterToMail } from '@/features/decisions/letterDelivery'
import { LettersToMail } from './lettersToMail'

vi.mock('./letterActions', () => ({ recordLetterMailedAction: vi.fn() }))
vi.mock('@/features/auth/csrfRefresh', () => ({ ensureCsrfAction: () => Promise.resolve('tok') }))

afterEach(cleanup)

const base: LetterToMail = {
  id: 'm1',
  partyName: 'Pat Paper',
  partyRole: 'agent',
  documentId: 'd1',
  documentTitle: 'Decision letter',
  mailedOn: null,
}

describe('LettersToMail', () => {
  it('offers the printable letter and a mailed date to staff who record board work', () => {
    render(<LettersToMail data={{ letters: [base], canRecord: true, today: '2027-07-12' }} />)
    expect(screen.getByRole('link', { name: 'Print Decision letter' }).getAttribute('href')).toBe(
      '/api/documents/d1',
    )
    expect(screen.getByLabelText(/Date mailed/)).toHaveProperty('value', '2027-07-12')
    expect(screen.getByRole('button', { name: 'Record mailed' })).toBeDefined()
  })

  it('shows the date once mailed and hides the form from others', () => {
    render(
      <LettersToMail
        data={{
          letters: [
            { ...base, mailedOn: '2027-07-12' },
            { ...base, id: 'm2', partyName: 'Ann' },
          ],
          canRecord: false,
          today: '2027-07-12',
        }}
      />,
    )
    expect(screen.getByText('Mailed July 12, 2027.')).toBeDefined()
    expect(screen.getByText('Not mailed yet.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Record mailed' })).toBeNull()
  })

  it('renders nothing when no letter needs mailing', () => {
    const { container } = render(
      <LettersToMail data={{ letters: [], canRecord: true, today: '2027-07-12' }} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
