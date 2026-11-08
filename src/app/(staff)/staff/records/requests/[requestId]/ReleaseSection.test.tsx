// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReleaseCandidate, ReleaseSummary, RequestApproval } from '@/features/rtk/requestPage'
import { FindResults } from './FindResults'
import { ReleaseSection } from './ReleaseSection'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../../renditionActions', () => ({
  approveRenditionAction: vi.fn(),
  revokeApprovalAction: vi.fn(),
}))

afterEach(cleanup)

const candidates: ReleaseCandidate[] = [
  {
    documentId: 'd1',
    title: 'Site plan',
    context: 'Application BP-2027-0001',
    originalVersionId: 'v1',
    versions: [
      {
        id: 'v1',
        role: 'original',
        filename: 'site-plan.pdf',
        createdAt: '2027-03-02T15:00:00.000Z',
      },
      {
        id: 'v2',
        role: 'release_redacted',
        filename: 'site-plan.pdf',
        createdAt: '2027-03-03T16:30:00.000Z',
      },
      {
        id: 'v3',
        role: 'release_redacted',
        filename: 'site-plan.pdf',
        createdAt: '2027-03-03T19:05:00.000Z',
      },
    ],
  },
]

const context = {
  requestId: 'r1',
  find: 'site plan',
  userId: 'u1',
  timeZone: 'America/New_York',
  canRedact: true,
}

function renderResults(canRedact = true) {
  render(
    <CsrfProvider token="t1">
      <FindResults context={{ ...context, canRedact }} candidates={candidates} />
    </CsrfProvider>,
  )
}

describe('find results', () => {
  it('lists each version with its own Approve button and tells same-day copies apart in town time', () => {
    renderResults()
    const versions = within(screen.getByRole('list', { name: 'Versions of Site plan' }))
    const labels = versions.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    expect(labels).toEqual([
      'Original, March 2, 2027',
      'Redacted copy for this request, March 3, 2027, 11:30 AM',
      'Redacted copy for this request, March 3, 2027, 2:05 PM',
    ])
    expect(document.body.textContent).not.toContain('UTC')
    expect(screen.getAllByRole('button', { name: /^Approve Site plan/ })).toHaveLength(3)
  })

  it('links the original to the redaction editor for this request', () => {
    renderResults()
    expect(screen.getByRole('link', { name: 'Redact for this request' }).getAttribute('href')).toBe(
      '/staff/records/redact/v1?request=r1',
    )
  })

  it('offers no redact link to someone who cannot redact', () => {
    renderResults(false)
    expect(screen.queryByRole('link', { name: 'Redact for this request' })).toBeNull()
  })
})

const release: ReleaseSummary = {
  id: 'rel1',
  sequence: 1,
  releasedOn: '2027-03-05',
  method: 'paper',
  letterDocumentId: 'letter1',
  items: [{ title: 'Site plan', filename: 'site-plan.pdf', withdrawn: false, approvalId: 'a1' }],
}

function approval(patch: Partial<RequestApproval>): RequestApproval {
  return {
    approvalId: 'a1',
    documentId: 'd1',
    versionId: 'v1',
    title: 'Site plan',
    role: 'original',
    revokedAt: null,
    approvedAt: new Date('2027-03-04T15:00:00Z'),
    versionCreatedAt: new Date('2027-03-02T15:00:00Z'),
    releasedIn: null,
    cited: true,
    ...patch,
  }
}

describe('releases panel', () => {
  it('puts each letter on its release row and marks approvals released or waiting', () => {
    render(
      <CsrfProvider token="t1">
        <ReleaseSection
          releases={[release]}
          approvals={[approval({ releasedIn: 1 }), approval({ approvalId: 'a2', title: 'Deed' })]}
          canManage
          findTool={null}
        />
      </CsrfProvider>,
    )
    const row = screen.getByText(/^Release 1, March 5, 2027/).closest('li') as HTMLElement
    expect(within(row).getByRole('link', { name: 'Letter for release 1' })).toBeTruthy()
    const approvals = within(screen.getByRole('list', { name: 'Approved for this request' }))
    expect(approvals.getByText('Released in release 1')).toBeTruthy()
    expect(approvals.getByText('Waiting')).toBeTruthy()
    expect(approvals.getAllByText('Revoke approval', { selector: 'summary' })).toHaveLength(2)
  })
})
