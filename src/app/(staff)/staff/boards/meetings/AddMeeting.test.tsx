// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('../actions', () => ({ scheduleMeetingAction: vi.fn() }))

const { AddMeeting } = await import('./AddMeeting')
const { scheduleMeetingAction } = await import('../actions')

afterEach(cleanup)

describe('adding a meeting', () => {
  it('shows a refused location beside the Location field', async () => {
    vi.mocked(scheduleMeetingAction).mockResolvedValue(
      refusal('location', 'Enter a location of 200 characters or fewer.'),
    )
    render(
      <CsrfProvider token="t">
        <AddMeeting boards={[['zba', 'Zoning Board']]} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting' }))
    fireEvent.change(screen.getByLabelText(/^Date( \*)?$/), { target: { value: '2027-05-05' } })
    await expectRefusalBeside(
      screen.getAllByRole('button', { name: 'Add meeting' }).at(-1) as HTMLElement,
      () => screen.getByLabelText(/^Location( \*)?$/),
      'Enter a location of 200 characters or fewer.',
    )
  })
})
