// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('./packetActions', () => ({
  renamePacketAction: vi.fn(),
  replaceAgendaAction: vi.fn(),
  sendToBoardAction: vi.fn(),
  sendUpdateAction: vi.fn(),
  sendOutsideAction: vi.fn(),
  resendAction: vi.fn(),
  turnOffLinkAction: vi.fn(),
  gatherPacketAction: vi.fn(),
}))
vi.mock('./PacketGather', () => ({ GatherStep: () => null }))

const { PacketSection } = await import('./PacketSection')
const { renamePacketAction } = await import('./packetActions')

afterEach(cleanup)

const panel = {
  meetingId: 'm1',
  boardName: 'Zoning Board',
  zone: 'America/New_York',
  state: { label: 'Saved' },
  gather: {},
  canShare: false,
  agendaChanged: false,
  review: { packetId: 'p1', title: 'April packet', lines: [] },
  send: null,
  recipients: [],
} as unknown as Parameters<typeof PacketSection>[0]['panel']

describe('renaming the packet', () => {
  it('shows a refused title beside the Title field', async () => {
    vi.mocked(renamePacketAction).mockResolvedValue(
      refusal('title', 'Enter a title of 200 characters or fewer.'),
    )
    render(
      <CsrfProvider token="t">
        <PacketSection panel={panel} />
      </CsrfProvider>,
    )
    await expectRefusalBeside(
      screen.getByRole('button', { name: 'Save title' }),
      () => screen.getByLabelText(/^Title( \*)?$/),
      'Enter a title of 200 characters or fewer.',
    )
  })
})
