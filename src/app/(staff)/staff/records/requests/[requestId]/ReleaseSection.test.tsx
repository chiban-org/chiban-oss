// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReleaseCandidate } from '@/features/rtk/requestPage'
import type { CivilDate } from '@/types/civilDate'
import { ReleaseSection } from './ReleaseSection'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../../renditionActions', () => ({
  approveRenditionAction: vi.fn(),
  revokeApprovalAction: vi.fn(),
}))
vi.mock('../actions', () => ({ createReleaseAction: vi.fn() }))

afterEach(cleanup)

const candidates: ReleaseCandidate[] = [
  {
    documentId: 'd1',
    title: 'Site plan',
    context: 'Application BP-2027-0001',
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
        createdAt: '2027-03-04T09:05:00.000Z',
      },
    ],
  },
]

function versionOptions(): string[] {
  render(
    <CsrfProvider token="t1">
      <ReleaseSection
        find={{ requestId: 'r1', find: 'site plan', userId: 'u1', example: null }}
        releases={[]}
        approvals={[]}
        candidates={candidates}
        today={'2027-03-05' as CivilDate}
        canManage={true}
        working={true}
      />
    </CsrfProvider>,
  )
  const select = screen.getByLabelText('Document and version')
  return within(select)
    .getAllByRole('option')
    .map((o) => o.textContent)
}

describe('ReleaseSection', () => {
  it('tells two redacted copies of the same document apart by when they were made', () => {
    const labels = versionOptions()
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toEqual([
      'Site plan, Application BP-2027-0001: Original, March 2, 2027',
      'Site plan, Application BP-2027-0001: Redacted copy for this request, March 3, 2027 16:30 UTC',
      'Site plan, Application BP-2027-0001: Redacted copy for this request, March 4, 2027 09:05 UTC',
    ])
  })
})
