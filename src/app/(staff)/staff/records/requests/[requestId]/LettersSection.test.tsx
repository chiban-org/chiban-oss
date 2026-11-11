// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LettersSection } from './ResponseSection'

afterEach(cleanup)

const AT = new Date('2027-03-05T15:00:00Z')

describe('letters panel', () => {
  it('says which letters were emailed and which still need printing', () => {
    render(
      <LettersSection
        letters={[
          { id: 'l1', title: 'Response to request RK-2027-0001' },
          { id: 'l2', title: 'Denial of request RK-2027-0001' },
          { id: 'l3', title: 'Response to request RK-2027-0001, release 1' },
        ]}
        deliveries={[
          { documentId: 'l1', outcome: 'emailed', sentTo: 'jordan@example.test', at: AT },
          { documentId: 'l2', outcome: 'print', sentTo: null, at: AT },
        ]}
        timeZone="America/New_York"
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(
      within(items[0] as HTMLElement).getByText('Emailed to jordan@example.test on March 5, 2027.'),
    ).toBeTruthy()
    expect(
      within(items[1] as HTMLElement).getByText('No email address. Print this letter and send it.'),
    ).toBeTruthy()
    expect(within(items[2] as HTMLElement).queryByText(/Emailed|Print/)).toBeNull()
  })

  it('says when the email failed', () => {
    render(
      <LettersSection
        letters={[{ id: 'l1', title: 'Response to request RK-2027-0001' }]}
        deliveries={[
          { documentId: 'l1', outcome: 'email_failed', sentTo: 'jordan@example.test', at: AT },
        ]}
        timeZone="America/New_York"
      />,
    )
    expect(
      screen.getByText(
        'The email to jordan@example.test could not be sent. Print this letter and send it.',
      ),
    ).toBeTruthy()
  })
})
