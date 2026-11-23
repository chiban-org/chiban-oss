// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReleaseSummary, RequestApproval } from '@/features/rtk/requestPage'
import { ReleaseSection } from './ReleaseSection'

vi.mock('../actions', () => ({ createReleaseAction: vi.fn(), reissueLinkAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../../renditionActions', () => ({
  approveRenditionAction: vi.fn(),
  revokeApprovalAction: vi.fn(),
  stopReleaseLinkAction: vi.fn(),
}))

afterEach(cleanup)

const APPROVAL: RequestApproval = {
  approvalId: 'a1',
  documentId: 'd1',
  versionId: 'v2',
  title: 'Culvert letter',
  role: 'release_redacted',
  revokedAt: null,
  approvedAt: new Date('2027-03-04T15:00:00Z'),
  versionCreatedAt: new Date('2027-03-03T15:00:00Z'),
  releasedIn: 1,
  cited: true,
}

function releasedBy(method: ReleaseSummary['method'], withdrawn = false): ReleaseSummary {
  return {
    id: 'rel1',
    sequence: 1,
    releasedOn: '2027-03-05',
    method,
    letterDocumentId: null,
    items: [{ title: 'Culvert letter', filename: 'letter.pdf', withdrawn, approvalId: 'a1' }],
    link:
      method === 'electronic_link'
        ? { expiresAt: new Date('2027-04-04T15:00:00Z'), expired: false, revoked: false }
        : null,
    reissues: [],
  }
}

function approvals(release: ReleaseSummary, canManage = true) {
  render(
    <CsrfProvider token="t1">
      <ReleaseSection
        requestId="r1"
        releases={[release]}
        approvals={[APPROVAL]}
        canManage={canManage}
        findTool={null}
        timeZone="America/New_York"
        requesterEmail="marlo@example.test"
      />
    </CsrfProvider>,
  )
  return within(screen.getByRole('list', { name: 'Approved for this request' }))
}

describe('a released copy on the request page', () => {
  it('offers to stop the download link for a copy released by link, with a confirm', () => {
    const list = approvals(releasedBy('electronic_link'))
    expect(list.getByText('Stop the download link', { selector: 'summary' })).toBeTruthy()
    expect(list.queryByText('Revoke approval', { selector: 'summary' })).toBeNull()
    expect(list.getByLabelText(/^Why the link is being stopped/)).toBeTruthy()
  })

  it.each([
    'email',
    'paper',
    'inspection',
  ] as const)('offers neither revoke nor stop for a copy released by %s', (method) => {
    const list = approvals(releasedBy(method))
    expect(list.queryByText('Stop the download link', { selector: 'summary' })).toBeNull()
    expect(list.queryByText('Revoke approval', { selector: 'summary' })).toBeNull()
  })

  it('offers no stop once the copy was withdrawn from the link', () => {
    const list = approvals(releasedBy('electronic_link', true))
    expect(list.queryByText('Stop the download link', { selector: 'summary' })).toBeNull()
  })

  it('offers no stop to staff who cannot manage the request', () => {
    const list = approvals(releasedBy('electronic_link'), false)
    expect(list.queryByText('Stop the download link', { selector: 'summary' })).toBeNull()
  })
})
