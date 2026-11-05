// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { PacketGather } from '@/features/boards/packetGather'

vi.mock('./packetActions', () => ({ gatherPacketAction: vi.fn() }))

const { GatherStep } = await import('./PacketGather')

afterEach(cleanup)

function gather(trc: 'make' | 'made' | 'none'): PacketGather {
  return {
    meetingId: 'm1',
    board: 'zba',
    boardName: 'Zoning Board of Adjustment',
    title: 'Packet',
    packetId: null,
    groups: [
      {
        heading: 'Public hearing: Variance VAR-2027-0001',
        applicationId: 'a1',
        trc,
        candidates: [
          { documentId: 'd1', title: 'Plan', checked: true, exclusion: null },
          { documentId: 'd2', title: 'Letter', checked: false, exclusion: { kind: 'not_shared' } },
        ],
      },
    ],
  }
}

function renderStep(trc: 'make' | 'made' | 'none', canShare = true) {
  render(
    <CsrfProvider token="t">
      <GatherStep gather={gather(trc)} canShare={canShare} />
    </CsrfProvider>,
  )
}

describe('gather step', () => {
  it('says why a document is out and offers to share it with the board', () => {
    renderStep('none')
    expect(screen.getByText('Not shared with the board')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share with the board' })).toBeTruthy()
    expect(screen.getByText('No TRC review on this application')).toBeTruthy()
  })

  it('hides the share button from a viewer who cannot manage documents', () => {
    renderStep('none', false)
    expect(screen.queryByRole('button', { name: 'Share with the board' })).toBeNull()
  })

  it('offers a fresh TRC summary, unchecked, once one has been made', () => {
    renderStep('made')
    const fresh = screen.getByRole('checkbox', { name: 'Make a new TRC summary' })
    expect(fresh.getAttribute('aria-checked')).toBe('false')
  })
})
