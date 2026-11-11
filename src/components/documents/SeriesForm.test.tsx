// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { DocumentPanel, type DocumentPanelActions } from '@/components/documents/DocumentPanel'
import type { PanelDocument } from '@/features/documents/panelData'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const noop = () => Promise.resolve({ ok: true as const, message: 'ok' })

const DOC = {
  documentId: 'd1',
  title: 'Septic design',
  docKind: 'attachment',
  audiences: [],
  isPublic: false,
  hasRedactedCopy: false,
  supersededBy: null,
  createdAt: '2027-03-02T15:00:00.000Z',
  preservation: 'preserved',
  preservationRecordId: 'p1',
  series: {
    key: 'nh.rs.building_permits',
    label: 'Building permits: applications and approvals',
    citation: { label: 'RSA 33-A:3-a XV', url: 'https://gc.nh.gov/rsa/html/III/33-A/33-A-3-a.htm' },
  },
  retention: 'Permanent',
  holdCount: 0,
  uploadedBy: 'Sam Clerk',
  rendition: 'none',
  approvalId: null,
  approvedRole: null,
  approvedVersionId: null,
  originalVersionId: 'v1',
  approvable: [],
  canRedact: false,
  recordKind: 'application',
  caseIsPublic: null,
  parcelId: 'p1',
} as unknown as PanelDocument

function view(canManage: boolean, setSeries = vi.fn((_form: FormData) => noop())) {
  const actions: DocumentPanelActions = {
    setAudiences: noop,
    setPublic: noop,
    retry: noop,
    setSeries,
    uploadRedacted: {
      createIntent: () => Promise.resolve({ ok: false, error: 'x' }),
      finalize: () => Promise.resolve({ ok: false, error: 'x' }),
    },
  }
  render(
    <CsrfProvider token="t1">
      <DocumentPanel
        documents={[DOC]}
        canPublish={false}
        canManage={canManage}
        actions={actions}
        target={{ kind: 'application', id: 'a1' }}
      />
    </CsrfProvider>,
  )
  return setSeries
}

describe('changing a document record series', () => {
  it('offers the series list with the current series chosen and sends the new one', async () => {
    const setSeries = view(true)
    const form = screen
      .getByRole('button', { name: 'Save record series' })
      .closest('form') as HTMLElement
    const select = within(form).getByLabelText<HTMLSelectElement>(/^Record series/)
    expect(select.value).toBe('nh.rs.building_permits')
    fireEvent.change(select, { target: { value: 'nh.rs.correspondence_administrative' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save record series' }))
    await waitFor(() => expect(setSeries).toHaveBeenCalled())
    const sent = setSeries.mock.calls[0]?.[0]
    expect(sent?.get('documentId')).toBe('d1')
    expect(sent?.get('seriesKey')).toBe('nh.rs.correspondence_administrative')
  })

  it('shows no series control to someone who cannot manage documents', () => {
    view(false)
    expect(screen.queryByRole('button', { name: 'Save record series' })).toBeNull()
  })
})
