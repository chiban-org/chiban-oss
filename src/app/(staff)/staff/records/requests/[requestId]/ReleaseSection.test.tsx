// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReleaseCandidate, ReleaseSummary, RequestApproval } from '@/features/rtk/requestPage'
import type { CivilDate } from '@/types/civilDate'
import { FindResults } from './FindResults'
import { PendingRelease } from './PendingRelease'
import { ReleaseSection } from './ReleaseSection'

vi.mock('../actions', () => ({ createReleaseAction: vi.fn(), reissueLinkAction: vi.fn() }))
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
  link: null,
  reissues: [],
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
          timeZone="America/New_York"
          requesterEmail={null}
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

describe('approved records waiting for release', () => {
  it('asks which version to release when a document has two approvals, newest chosen', () => {
    render(
      <CsrfProvider token="t1">
        <PendingRelease
          requestId="r1"
          pending={[
            approval({ approvalId: 'a1', versionId: 'v1' }),
            approval({
              approvalId: 'a2',
              versionId: 'v2',
              role: 'release_redacted',
              approvedAt: new Date('2027-03-05T15:00:00Z'),
            }),
            approval({ approvalId: 'a3', documentId: 'd2', versionId: 'v9', title: 'Deed' }),
          ]}
          today={'2027-03-06' as CivilDate}
          timeZone="America/New_York"
          requesterContact="Jordan@example.test, 603-555-0142"
        />
      </CsrfProvider>,
    )
    const choice = screen.getByRole('group', { name: 'Which version of Site plan to release' })
    const radios = within(choice).getAllByRole<HTMLInputElement>('radio')
    expect(radios.map((r) => [r.value, r.checked])).toEqual([
      ['d1:a1', false],
      ['d1:a2', true],
    ])
    const hidden = document.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="items"]')
    expect([...hidden].map((i) => i.value)).toEqual(['d2:a3'])
    expect(screen.getByRole('button', { name: 'Release 2 records' })).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>(/^Requester's email address/).value).toBe(
      'jordan@example.test',
    )
    expect(
      screen.getByText(
        'By email, the letter goes with the records. For inspection or a paper copy, the release letter is emailed to jordan@example.test.',
      ),
    ).toBeTruthy()
  })
})
