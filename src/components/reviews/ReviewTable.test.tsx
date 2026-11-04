// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReviewTable } from '@/components/reviews/ReviewTable'

afterEach(cleanup)

const link = { href: '/staff/reviews', direction: null }
const links = { number: link, project: link, status: link, due: link }

describe('ReviewTable', () => {
  it('shows each review status as a label and an undated review in plain words', () => {
    render(
      <ReviewTable
        links={links}
        empty={null}
        rows={[
          {
            assignmentId: 'a1',
            number: 'BP-2026-0001',
            projectTitle: 'Garage addition',
            status: 'pending',
            commentDue: null,
          },
          {
            assignmentId: 'a2',
            number: 'BP-2026-0002',
            projectTitle: 'Deck',
            status: 'signed_off',
            commentDue: '2027-03-15',
          },
        ]}
      />,
    )
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Signed off')).toBeTruthy()
    expect(screen.queryByText('pending')).toBeNull()
    expect(screen.getByText('No date set')).toBeTruthy()
    expect(screen.getByText('Mar 15, 2027')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'BP-2026-0001' }).getAttribute('href')).toBe(
      '/staff/reviews/a1',
    )
  })
})
