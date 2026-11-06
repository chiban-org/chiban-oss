// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { DocumentPanelActions } from '@/components/documents/DocumentPanel'
import type { PanelDocument } from '@/features/documents/panelData'
import type { WorklistRow } from '@/features/records/worklist'
import { expectGroupRefusal, expectRefusalBeside } from '@/test/besideField'
import type { CivilDate } from '@/types/civilDate'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./actions', () => ({
  placeHoldAction: answer,
  releaseHoldAction: answer,
  recordBuildingRemovedAction: answer,
  setAudiencesAction: answer,
  setPublicAction: answer,
  retryPreservationAction: answer,
}))
vi.mock('./retention/actions', () => ({
  recordRetentionEventAction: answer,
  proposeDispositionAction: answer,
  approveDispositionAction: answer,
  cancelDispositionAction: answer,
}))
vi.mock('./renditionActions', () => ({
  approveRenditionAction: answer,
  revokeApprovalAction: answer,
}))

const { PlaceHold, ReleaseHold } = await import('./holds/HoldForms')
const { RecordsPanel } = await import('../applications/[applicationId]/recordsPanels')
const { WorklistTable } = await import('./retention/WorklistTable')
const { BatchesSection } = await import('./retention/BatchesSection')
const { DocumentPanel } = await import('@/components/documents/DocumentPanel')

afterEach(cleanup)

function inProvider(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

function open(summary: string) {
  fireEvent.click(screen.getByText(summary, { selector: 'summary' }))
}

const SHORT = 'Enter a reason of at least 10 characters.'

describe('records forms show a refusal beside their field', () => {
  it('the reference when placing a hold', async () => {
    const message = 'No record was found with that reference.'
    refuseWith('targetRef', message)
    inProvider(<PlaceHold />)
    fireEvent.click(screen.getByRole('button', { name: 'Place a hold' }))
    const reference = await screen.findByRole('textbox', { name: /Application number/ })
    fireEvent.change(reference, { target: { value: 'NOPE' } })
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Litigation pending' } })
    fireEvent.click(screen.getByRole('button', { name: 'Place hold' }))
    await expectRefusalBeside(reference, message)
  })

  it('the release reason, before the confirm opens', async () => {
    refuseWith('reason', SHORT)
    inProvider(<ReleaseHold holdId="h1" />)
    open('Release')
    const reason = screen.getByRole('textbox', { name: /Release reason/ })
    fireEvent.change(reason, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Release hold' }))
    await expectRefusalBeside(reason, SHORT)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('the hold reason on an application', async () => {
    refuseWith('reason', SHORT)
    inProvider(
      <RecordsPanel
        applicationId="a1"
        projectId="p1"
        snapshots={[]}
        holds={[]}
        canHold
        canManage
        buildingRemoval
        zone="America/New_York"
      />,
    )
    open('Place a legal hold')
    const reason = screen.getByRole('textbox', { name: /Reason/ })
    fireEvent.change(reason, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Place hold on this application' }))
    await expectRefusalBeside(reason, SHORT)
  })

  it('the date the building was removed', async () => {
    const message = 'Enter the date the building was removed as a date.'
    refuseWith('occurredOn', message)
    inProvider(
      <RecordsPanel
        applicationId="a1"
        projectId="p1"
        snapshots={[]}
        holds={[]}
        canHold
        canManage
        buildingRemoval
        zone="America/New_York"
      />,
    )
    open('Record the building removed')
    const date = screen.getByLabelText(/^Date the building was removed/)
    fireEvent.change(date, { target: { value: '2026-11-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record building removed' }))
    await expectRefusalBeside(date, message)
  })

  it('the date a retention event happened', async () => {
    const message = 'Enter the date it happened between January 1, 1900 and November 6, 2026.'
    refuseWith('occurredOn', message)
    const row = {
      ref: { kind: 'document', id: 'd1' },
      title: 'Plat',
      owner: null,
      href: null,
      eventTarget: { kind: 'project', id: 'p1' },
      series: {
        key: 's',
        label: 'Plans',
        citation: { label: 'RSA 33-A', url: 'https://example.test' },
      },
      status: { state: 'not_yet_triggered', awaiting: ['building_removed'] },
      holds: 0,
    } as unknown as WorklistRow
    inProvider(<WorklistTable rows={[row]} state="awaiting_event" links={{} as never} mayRecord />)
    open('Record event')
    const date = screen.getByLabelText(/^Date it happened/)
    fireEvent.change(date, { target: { value: '2026-11-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record event' }))
    await expectRefusalBeside(date, message)
  })

  it('the date to propose a disposition batch for', async () => {
    const message = 'No records are eligible on that date.'
    refuseWith('asOf', message)
    inProvider(
      <BatchesSection
        batches={[]}
        more={false}
        allHref="/x"
        zone="America/New_York"
        today={'2026-11-06' as CivilDate}
      />,
    )
    open('Propose a batch')
    fireEvent.click(screen.getByRole('button', { name: 'Propose batch' }))
    await expectRefusalBeside(screen.getByLabelText(/^Records eligible on or before/), message)
  })
})

const noop = () => Promise.resolve({ ok: true as const, message: 'ok' })
const actions: DocumentPanelActions = {
  setAudiences: answer,
  setPublic: noop,
  retry: noop,
  approve: answer,
  revoke: answer,
  uploadRedacted: {
    createIntent: () => Promise.resolve({ ok: false, error: 'x' }),
    finalize: () => Promise.resolve({ ok: false, error: 'x' }),
  },
}

const document_: PanelDocument = {
  documentId: 'd1',
  title: 'Septic design',
  docKind: 'attachment',
  audiences: ['project_parties'],
  isPublic: true,
  hasRedactedCopy: false,
  supersededBy: null,
  createdAt: '2027-03-02T15:00:00.000Z',
  preservation: 'preserved',
  preservationRecordId: 'p1',
  series: {
    label: 'Building permits',
    citation: { label: 'RSA 33-A', url: 'https://example.test' },
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
}

function panel() {
  inProvider(
    <DocumentPanel
      documents={[document_]}
      canPublish
      canManage
      actions={actions}
      target={{ kind: 'application', id: 'a1' }}
    />,
  )
  open('Manage')
}

describe('document forms show a refusal beside their field', () => {
  it('the audiences, beside the list', async () => {
    const message = 'Choose from the audiences listed.'
    refuseWith('audience', message)
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Save audiences' }))
    const box = await screen.findByRole('checkbox', { name: 'Board' })
    await expectGroupRefusal(box, message)
  })

  it('the review statement when approving for the public', async () => {
    refuseWith('reviewStatement', 'Enter a review statement.')
    panel()
    const statement = screen.getByRole('textbox', { name: /What you checked/ })
    fireEvent.change(statement, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve for the public' }))
    await expectRefusalBeside(statement, 'Enter a review statement.')
  })

  it('the revoke reason', async () => {
    refuseWith('reason', SHORT)
    panel()
    const reason = screen.getByRole('textbox', { name: /Why it is being revoked/ })
    fireEvent.change(reason, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke the approval' }))
    await expectRefusalBeside(reason, SHORT)
  })
})
