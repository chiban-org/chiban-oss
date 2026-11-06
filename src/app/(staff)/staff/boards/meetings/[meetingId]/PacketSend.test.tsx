// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('./packetActions', () => ({
  sendToBoardAction: vi.fn(),
  sendUpdateAction: vi.fn(),
  sendOutsideAction: vi.fn(),
  resendAction: vi.fn(),
  turnOffLinkAction: vi.fn(),
}))

const { SendStep } = await import('./PacketSend')
const { sendOutsideAction } = await import('./packetActions')

afterEach(cleanup)

const send = {
  packetId: 'p1',
  membersNotSent: 0,
  sent: false,
  pending: 0,
  pendingSummary: '',
} as unknown as Parameters<typeof SendStep>[0]['send']

describe('sending the packet outside the board', () => {
  it('shows a refused name beside the Name field', async () => {
    vi.mocked(sendOutsideAction).mockResolvedValue(refusal('recipientName', 'Enter a name.'))
    render(
      <CsrfProvider token="t">
        <SendStep send={send} boardName="Zoning Board" recipients={[]} zone="America/New_York" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Also send to someone outside the board'))
    fireEvent.change(screen.getByLabelText(/^Name( \*)?$/), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText(/^Email( \*)?$/), {
      target: { value: 'counsel@alderpond.example' },
    })
    await expectRefusalBeside(
      screen.getByRole('button', { name: 'Send the link' }),
      () => screen.getByLabelText(/^Name( \*)?$/),
      'Enter a name.',
    )
  })
})
