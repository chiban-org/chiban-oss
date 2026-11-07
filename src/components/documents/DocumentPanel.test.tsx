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
      key: 'nh.rs.building_permits',
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
    recordKind: 'application',
    caseIsPublic: null,
    parcelId: 'p1',
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
  it('says the redacted copy is what the public site shows when that version is approved', () => {
    view([doc({ hasRedactedCopy: true, approvedRole: 'public_redacted' })])
    expect(screen.getByText('Shown on the public site')).toBeTruthy()
    expect(
      screen.getByText(
        'Everyone. Shown on the public site on the parcel page, as the redacted copy.',
      ),
    ).toBeTruthy()
  })

  it('chips one document as shown and the private one as not on the public site', () => {
    view([doc({ isPublic: true }), doc({ documentId: 'd2', title: 'Private', isPublic: false })])
    expect(screen.getAllByText('Shown on the public site')).toHaveLength(1)
    expect(screen.getAllByText('Not on the public site')).toHaveLength(1)
  })

  it('keeps a document on a private case off the public site in the chip and the sentence', () => {
    view([doc({ recordKind: 'enforcement_case', audiences: [], caseIsPublic: false })])
    expect(screen.getByText('Not on the public site')).toBeTruthy()
    expect(screen.queryByText('Shown on the public site')).toBeNull()
    expect(
      screen.getByText('Town staff only. Not on the public site: the case is not public.'),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'See what the public sees' })).toBeNull()
  })

  it('states who can see the document even to someone who can change nothing', () => {
    view([doc({ isPublic: false, rendition: 'none', approvalId: null })], false, false)
    const block = screen.getByRole('group', { name: 'Who can see this' })
    expect(
      within(block).getByText(
        'Town staff, project parties and assigned reviewers. Not on the public site: no copy is approved for the public yet.',
      ),
    ).toBeTruthy()
    expect(within(block).queryByText('Change who can see this')).toBeNull()
  })

  it('links a shown document to the public parcel page in a new tab', () => {
    view([doc(), doc({ documentId: 'd2', title: 'Private', isPublic: false })])
    const links = screen.getAllByRole('link', { name: 'See what the public sees' })
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/parcels/p1')
    expect(links[0]?.getAttribute('target')).toBe('_blank')
  })

  it('labels the public switch Show on the public site and says where it shows', () => {
    view([doc()])
    const form = screen
      .getByRole('button', { name: 'Save public site setting' })
      .closest('form') as HTMLElement
    expect(within(form).getByLabelText('Show on the public site')).toBeTruthy()
    expect(
      within(form).getByText('Shows the approved copy to signed-out visitors on the parcel page.'),
    ).toBeTruthy()
  })

  it('offers no signed-in access choices on a record where none of them grant anything', () => {
    view([doc({ recordKind: 'parcel' })])
    expect(screen.queryByRole('button', { name: 'Save signed-in access' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save public site setting' })).toBeTruthy()
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
    expect(screen.queryByRole('button', { name: 'Save public site setting' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry preservation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save signed-in access' })).toBeNull()
  })

  it('labels the disclosure Details, not Manage, for someone who can take no action on it', () => {
    view([doc()], false, false)
    expect(screen.queryByText('Manage')).toBeNull()
    expect(screen.getByText('Details')).toBeTruthy()
  })

  it('keeps Manage when the viewer may redact or manage', () => {
    view([doc({ canRedact: true })], false, false)
    expect(screen.getByText('Manage')).toBeTruthy()
    cleanup()
    view([doc()], false, true)
    expect(screen.getByText('Manage')).toBeTruthy()
  })

  it('gives a viewer who may only change the public setting Change who can see this and Details', () => {
    view([doc()], true, false)
    expect(screen.getByText('Change who can see this')).toBeTruthy()
    expect(screen.getByText('Details')).toBeTruthy()
    expect(screen.queryByText('Manage')).toBeNull()
  })

  it('offers signed-in access checkboxes, the public switch, and retry for staff', () => {
    view([doc({ preservation: 'incomplete' })])
    const form = screen
      .getByRole('button', { name: 'Save signed-in access' })
      .closest('form') as HTMLElement
    expect(
      within(form).getByText(
        'Signed-in access. Town staff can always open this document. Tick who else may open it after signing in. This never puts it on the public site.',
      ),
    ).toBeTruthy()
    expect(within(form).getByLabelText('Project parties')).toBeTruthy()
    expect(within(form).getByLabelText('Assigned reviewers')).toBeTruthy()
    expect(within(form).getByLabelText('Board members')).toBeTruthy()
    expect(screen.getByLabelText('Show on the public site')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry preservation' })).toBeTruthy()
  })

  it('chips and explains each approval state', () => {
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
    expect(screen.getAllByText('Shown on the public site')).toHaveLength(1)
    expect(screen.getAllByText('Not on the public site')).toHaveLength(3)
    expect(screen.getByText(/no copy is approved for the public yet\.$/)).toBeTruthy()
    expect(screen.getByText(/the redacted copy is waiting for approval\.$/)).toBeTruthy()
    expect(screen.getByText(/the public approval was revoked\.$/)).toBeTruthy()
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
    expect(screen.getByText('Not on the public site')).toBeTruthy()
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
