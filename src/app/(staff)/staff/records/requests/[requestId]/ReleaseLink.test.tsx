// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReleaseSummary } from '@/features/rtk/requestPage'
import { ReleaseSection } from './ReleaseSection'

vi.mock('../actions', () => ({ createReleaseAction: vi.fn(), reissueLinkAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../../renditionActions', () => ({
  approveRenditionAction: vi.fn(),
  revokeApprovalAction: vi.fn(),
}))

afterEach(cleanup)

const linked = (link: ReleaseSummary['link'], reissues: ReleaseSummary['reissues'] = []) => ({
  id: 'rel1',
  sequence: 1,
  releasedOn: '2027-03-05',
  method: 'electronic_link' as const,
  letterDocumentId: null,
  items: [{ title: 'Site plan', filename: 'site-plan.pdf', withdrawn: false, approvalId: 'a1' }],
  link,
  reissues,
})

function show(release: ReleaseSummary, canManage = true) {
  render(
    <CsrfProvider token="t1">
      <ReleaseSection
        releases={[release]}
        approvals={[]}
        canManage={canManage}
        findTool={null}
        timeZone="America/New_York"
        requesterEmail="jordan@example.test"
      />
    </CsrfProvider>,
  )
  return screen.getByText(/^Release 1, /).closest('li') as HTMLElement
}

const EXPIRED = { expiresAt: new Date('2027-04-04T15:00:00Z'), expired: true, revoked: false }

describe('release link', () => {
  it('says when a working link stops and offers nothing to send', () => {
    const row = show(
      linked({ expiresAt: new Date('2027-04-04T15:00:00Z'), expired: false, revoked: false }),
    )
    expect(within(row).getByText('The link works until April 4, 2027.')).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Send a new link' })).toBeNull()
  })

  it('offers a new link for an expired one, addressed to the requester by default', () => {
    const row = show(linked(EXPIRED))
    expect(within(row).getByText('The link expired on April 4, 2027.')).toBeTruthy()
    const email = within(row).getByLabelText<HTMLInputElement>(/^Send it to/)
    expect(email.value).toBe('jordan@example.test')
    expect(within(row).getByRole('button', { name: 'Send a new link' })).toBeTruthy()
  })

  it('lists the new links already sent', () => {
    const row = show(
      linked(EXPIRED, [
        { sentTo: 'jordan@example.test', sentAt: new Date('2027-04-10T15:00:00Z') },
      ]),
    )
    expect(
      within(row).getByText('New link sent to jordan@example.test on April 10, 2027.'),
    ).toBeTruthy()
  })

  it('offers no new link to someone who cannot manage requests', () => {
    const row = show(linked(EXPIRED), false)
    expect(within(row).queryByRole('button', { name: 'Send a new link' })).toBeNull()
  })
})
