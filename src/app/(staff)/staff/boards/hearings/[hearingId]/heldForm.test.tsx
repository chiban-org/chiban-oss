// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('../actions', () => ({ markHeldAction: vi.fn() }))

const { HeldForm } = await import('./heldForm')
const { markHeldAction } = await import('../actions')

afterEach(cleanup)

function show(meetingDate: string) {
  render(
    <CsrfProvider token="t">
      <HeldForm
        hearingId="h1"
        meetingDate={meetingDate}
        meetingText="December 9, 2026"
        today="2026-11-02"
      />
    </CsrfProvider>,
  )
}

describe('mark the hearing held', () => {
  it('is not offered before the meeting has happened', () => {
    show('2026-12-09')
    expect(screen.queryByLabelText(/^Date\ held( \*)?$/)).toBeNull()
    expect(screen.getByText(/after the meeting on December 9, 2026/)).toBeTruthy()
  })

  it('limits the held date to the meeting through today', () => {
    show('2026-10-28')
    const input = screen.getByLabelText(/^Date\ held( \*)?$/)
    expect(input.getAttribute('min')).toBe('2026-10-28')
    expect(input.getAttribute('max')).toBe('2026-11-02')
  })

  it('shows a refused date beside the Date held field', async () => {
    vi.mocked(markHeldAction).mockResolvedValue(
      refusal('heldOn', 'The date cannot be before the meeting.'),
    )
    show('2026-10-28')
    await expectRefusalBeside(
      screen.getByRole('button', { name: /Mark/ }),
      () => screen.getByLabelText(/^Date\ held( \*)?$/),
      'The date cannot be before the meeting.',
    )
  })
})
