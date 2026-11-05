// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { DocumentPanel, type DocumentPanelActions } from '@/components/documents/DocumentPanel'
import type { PanelDocument } from '@/features/documents/panelData'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const noop = () => Promise.resolve({ ok: true as const, message: 'ok' })
const actions: DocumentPanelActions = {
  setAudiences: noop,
  setPublic: noop,
  retry: noop,
  approve: noop,
  revoke: noop,
  uploadRedacted: {
    createIntent: () => Promise.resolve({ ok: false, error: 'x' }),
    finalize: () => Promise.resolve({ ok: false, error: 'x' }),
  },
}

function doc(overrides: Partial<PanelDocument> = {}): PanelDocument {
  return {
    documentId: 'd1',
    title: 'Septic design',
    docKind: 'attachment',
    audiences: ['project_parties', 'reviewers'],
    isPublic: true,
    hasRedactedCopy: false,
    supersededBy: null,
    createdAt: '2027-03-02T15:00:00.000Z',
    preservation: 'preserved',
    preservationRecordId: 'p1',
    series: {
      label: 'Building permits: applications and approvals',
      citation: {
        label: 'RSA 33-A:3-a XV',
        url: 'https://gc.nh.gov/rsa/html/III/33-A/33-A-3-a.htm',
      },
    },
    retention: 'Permanent',
    holdCount: 0,
    uploadedBy: 'Sam Clerk',
    rendition: 'approved',
    approvalId: 'ap1',
    approvedRole: 'original',
    approvedVersionId: 'v1',
    originalVersionId: 'v1',
    approvable: [
      { id: 'v1', role: 'original', createdAt: '2027-03-02T15:00:00.000Z' },
      { id: 'v2', role: 'public_redacted', createdAt: '2027-03-03T16:30:00.000Z' },
    ],
    canRedact: false,
    ...overrides,
  }
}

function view(documents: PanelDocument[], canPublish = true, canManage = true) {
  render(
    <CsrfProvider token="t1">
      <DocumentPanel
        documents={documents}
        canPublish={canPublish}
        canManage={canManage}
        actions={actions}
        target={{ kind: 'application', id: 'a1' }}
      />
    </CsrfProvider>,
  )
}

describe('DocumentPanel', () => {
  it('document panel shows "Public copy: redacted" when a redacted version exists', () => {
    view([doc({ hasRedactedCopy: true, approvedRole: 'public_redacted' })])
    expect(screen.getByText('Public copy: redacted')).toBeTruthy()
  })

  it('shows "Public copy: original" when public with no redacted copy, and nothing when private', () => {
    view([doc({ isPublic: true }), doc({ documentId: 'd2', title: 'Private', isPublic: false })])
    expect(screen.getAllByText('Public copy: original')).toHaveLength(1)
  })

  it('preservation chip has a text label and an icon', () => {
    view([doc({ preservation: 'incomplete' })])
    const chip = screen.getByText('Preservation incomplete')
    expect(chip.querySelector('svg')).not.toBeNull()
  })

  it('names the series with its citation, the retention, and a hold badge', () => {
    view([doc({ holdCount: 1, retention: 'Starts when the building is removed' })])
    expect(
      screen.getByText('Record series: Building permits: applications and approvals'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'RSA 33-A:3-a XV' }).getAttribute('href')).toContain(
      '33-A-3-a',
    )
    expect(screen.getByText('Retention: Starts when the building is removed')).toBeTruthy()
    expect(screen.getByText('Legal hold')).toBeTruthy()
  })

  it('hides publishing controls without document.publish and retry without document.manage', () => {
    view([doc({ preservation: 'incomplete' })], false, false)
    expect(screen.queryByRole('button', { name: 'Save public setting' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry preservation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save audiences' })).toBeNull()
  })

  it('labels the disclosure Details, not Manage, for someone who can take no action on it', () => {
    view([doc()], false, false)
    expect(screen.queryByText('Manage')).toBeNull()
    expect(screen.getByText('Details')).toBeTruthy()
  })

  it('keeps Manage when the viewer may redact, manage or publish', () => {
    view([doc({ canRedact: true })], false, false)
    expect(screen.getByText('Manage')).toBeTruthy()
    cleanup()
    view([doc()], false, true)
    expect(screen.getByText('Manage')).toBeTruthy()
  })

  it('offers audience checkboxes, the public toggle, and retry for staff', () => {
    view([doc({ preservation: 'incomplete' })])
    const form = screen
      .getByRole('button', { name: 'Save audiences' })
      .closest('form') as HTMLElement
    expect(within(form).getByLabelText('Project parties')).toBeTruthy()
    expect(within(form).getByLabelText('Reviewers')).toBeTruthy()
    expect(within(form).getByLabelText('Board')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry preservation' })).toBeTruthy()
  })

  it('shows one chip for each approval state', () => {
    view([
      doc({ documentId: 'a', title: 'A', rendition: 'approved' }),
      doc({ documentId: 'b', title: 'B', rendition: 'public_no_copy', approvalId: null }),
      doc({
        documentId: 'c',
        title: 'C',
        rendition: 'redacted_waiting',
        isPublic: false,
        approvalId: null,
      }),
      doc({ documentId: 'd', title: 'D', rendition: 'revoked', isPublic: false, approvalId: null }),
    ])
    expect(screen.getByText('Public copy: original')).toBeTruthy()
    expect(screen.getByText('Public, no approved copy')).toBeTruthy()
    expect(screen.getByText('Redacted, awaiting approval')).toBeTruthy()
    expect(screen.getByText('Revoked')).toBeTruthy()
  })

  it('offers approval until every version is approved, then offers only revocation', () => {
    view([doc({ rendition: 'public_no_copy', approvalId: null, approvedVersionId: null })])
    expect(screen.getByRole('button', { name: 'Approve for the public' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Revoke the approval' })).toBeNull()
    cleanup()
    view([
      doc({ approvable: [{ id: 'v1', role: 'original', createdAt: '2027-03-02T15:00:00.000Z' }] }),
    ])
    expect(screen.getByRole('button', { name: 'Revoke the approval' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve for the public' })).toBeNull()
  })

  it('shows the redact link only to people who may redact', () => {
    view([doc()])
    expect(screen.queryByRole('link', { name: 'Redact this document' })).toBeNull()
    cleanup()
    view([doc({ canRedact: true })])
    expect(screen.getByRole('link', { name: 'Redact this document' }).getAttribute('href')).toBe(
      '/staff/records/redact/v1',
    )
  })

  it('hides approval controls from people who cannot publish', () => {
    view([doc({ rendition: 'public_no_copy', approvalId: null })], false)
    expect(screen.queryByRole('button', { name: 'Approve for the public' })).toBeNull()
  })

  it('tells two redacted copies apart by when they were made', () => {
    view([doc({ rendition: 'public_no_copy', approvalId: null })])
    expect(
      screen.getByRole('option', { name: 'Redacted copy, March 3, 2027 16:30 UTC' }),
    ).toBeTruthy()
  })

  it('a redacted copy can be approved in place of the approved original without revoking first', () => {
    view([doc()])
    expect(screen.queryByRole('button', { name: 'Approve for the public' })).not.toBeNull()
    const options = screen.queryAllByRole('option').map((o) => o.getAttribute('value'))
    expect(options).toEqual(['v2'])
    expect(
      screen.queryByText('Approving another version replaces the current public copy.'),
    ).not.toBeNull()
  })

  it('shows the title, when and by whom it was added, and one public chip', () => {
    view([doc({ isPublic: false, rendition: 'none', approvalId: null })])
    expect(screen.getByText('Added March 2, 2027 by Sam Clerk')).toBeTruthy()
    expect(screen.getByText('Not public')).toBeTruthy()
    expect(screen.getByText('Preserved').closest('details')).not.toBeNull()
  })

  it('prints a series shared by every row once, and an unassigned series once', () => {
    view([doc(), doc({ documentId: 'd2', title: 'Plans' })])
    expect(
      screen.getAllByText('Record series: Building permits: applications and approvals'),
    ).toHaveLength(1)
    cleanup()
    view([doc({ series: null, retention: 'No record series assigned' })])
    expect(screen.getAllByText(/No record series assigned/)).toHaveLength(1)
  })
})
