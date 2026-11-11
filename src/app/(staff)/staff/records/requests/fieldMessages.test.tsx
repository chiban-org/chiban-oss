// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { RtkRequestView } from '@/features/rtk/requests'
import { expectRefusalBeside } from '@/test/besideField'
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

vi.mock('./actions', () => ({
  logRequestAction: answer,
  firstResponseAction: answer,
  withholdingAction: answer,
  createReleaseAction: answer,
  closeRequestAction: answer,
  denyRequestAction: answer,
}))
vi.mock('../renditionActions', () => ({
  approveRenditionAction: answer,
  revokeApprovalAction: answer,
}))

const { LogRequest } = await import('./LogRequestForm')
const { FirstResponseForm } = await import('./[requestId]/FirstResponseForm')
const { WithholdingsSection } = await import('./[requestId]/WithholdingsSection')
const { ReleaseSection } = await import('./[requestId]/ReleaseSection')
const { FindResults } = await import('./[requestId]/FindResults')
const { PendingRelease } = await import('./[requestId]/PendingRelease')
const { CloseStepForm } = await import('./[requestId]/CloseForms')
const { DenyStep } = await import('./[requestId]/DenyStep')

afterEach(cleanup)

const TODAY = '2026-11-06' as CivilDate
const REQUEST_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d'

function inProvider(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

const request = {
  id: REQUEST_ID,
  status: 'open',
  firstResponseKind: null,
  firstResponseOn: null,
  timeliness: { kind: 'open' },
  timeStatements: [],
  withholdings: [],
  rowVersion: 1,
  receivedOn: '2026-10-30',
  receivedVia: 'email',
  requesterName: null,
  requesterContact: null,
  statedDue: null,
  responseDue: null,
} as unknown as RtkRequestView

const approval = {
  approvalId: 'a1',
  documentId: 'd1',
  versionId: 'v1',
  title: 'Letter',
  role: 'original',
  revokedAt: null,
  approvedAt: new Date('2026-11-02T15:00:00Z'),
  versionCreatedAt: new Date('2026-11-01T15:00:00Z'),
  releasedIn: null,
  cited: true,
}

function open(summary: string) {
  fireEvent.click(screen.getByText(summary, { selector: 'summary' }))
}

describe('request forms show a refusal beside its field', () => {
  it('the request description', async () => {
    refuseWith('description', 'Enter what was asked for.')
    inProvider(<LogRequest today={TODAY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log a request' }))
    const description = await screen.findByRole('textbox', { name: /What was asked for/ })
    fireEvent.change(description, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log request' }))
    await expectRefusalBeside(description, 'Enter what was asked for.')
  })

  it('the charge amount on a time statement', async () => {
    refuseWith('costDollars', 'Enter the charge.')
    inProvider(
      <FirstResponseForm
        requestId={REQUEST_ID}
        today={TODAY}
        canDeny={false}
        startOnRelease={false}
        releaseStep={null}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Written statement of the time needed' }))
    fireEvent.change(screen.getByLabelText(/^Date the town will respond by/), {
      target: { value: '2026-11-20' },
    })
    fireEvent.change(screen.getByLabelText(/^Why more time is needed/), {
      target: { value: 'In storage' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record response' }))
    await expectRefusalBeside(screen.getByLabelText(/^Charge in dollars/), 'Enter the charge.')
  })

  it('the withholding explanation', async () => {
    const message = 'Enter an explanation of at least 20 characters.'
    refuseWith('explanation', message)
    inProvider(<WithholdingsSection request={request} working />)
    open('Record a withholding')
    fireEvent.change(screen.getByLabelText(/^Which record/), { target: { value: 'An email' } })
    const exemption = screen.getByLabelText<HTMLSelectElement>(/^Exemption/)
    fireEvent.change(exemption, { target: { value: exemption.options[1]?.value ?? '' } })
    const explanation = screen.getByRole('textbox', { name: /How the exemption applies/ })
    fireEvent.change(explanation, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record withholding' }))
    await expectRefusalBeside(explanation, message)
  })

  it('the review statement when approving a version for release', async () => {
    refuseWith('reviewStatement', 'Enter a review statement.')
    const candidates = [
      {
        documentId: 'd1',
        title: 'Letter',
        context: 'Parcel',
        originalVersionId: 'v1',
        versions: [
          { id: 'v1', role: 'original', filename: 'l.pdf', createdAt: '2026-11-01T10:00:00Z' },
        ],
      },
    ]
    const context = {
      requestId: REQUEST_ID,
      find: 'Letter',
      userId: 'u1',
      timeZone: 'America/New_York',
      canRedact: true,
    }
    inProvider(<FindResults context={context} candidates={candidates} />)
    const statement = screen.getByRole('textbox', { name: /What you checked/ })
    fireEvent.change(statement, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: /^Approve Letter/ }))
    await expectRefusalBeside(statement, 'Enter a review statement.')
  })

  it('the revoke reason', async () => {
    refuseWith('reason', 'Enter a reason of at least 10 characters.')
    inProvider(
      <ReleaseSection
        releases={[]}
        approvals={[approval]}
        canManage
        findTool={null}
        timeZone="America/New_York"
        requesterEmail={null}
      />,
    )
    open('Revoke approval')
    const reason = screen.getByRole('textbox', { name: /Why it is being revoked/ })
    fireEvent.change(reason, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke approval' }))
    await waitFor(() => expect(reason.getAttribute('aria-invalid')).toBe('true'))
  })

  it('the release date', async () => {
    const message = 'Enter the date released between January 1, 1900 and November 6, 2026.'
    refuseWith('releasedOn', message)
    inProvider(
      <PendingRelease
        requestId={REQUEST_ID}
        pending={[approval]}
        today={TODAY}
        timeZone="America/New_York"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Release 1 record' }))
    await expectRefusalBeside(screen.getByLabelText(/^Date released/), message)
  })

  it('the denial date, before the confirm opens', async () => {
    const message = 'The denial date cannot be before the time statement.'
    refuseWith('deniedOn', message)
    const waiting = {
      ...request,
      status: 'awaiting_decision',
      withholdings: [{ id: 'w1' }],
    } as unknown as RtkRequestView
    inProvider(<DenyStep request={waiting} today={TODAY} />)
    open('Deny the request')
    fireEvent.click(screen.getByRole('button', { name: 'Deny the request' }))
    await expectRefusalBeside(screen.getByLabelText(/^Date of the denial/), message)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('how to close the request, before the confirm opens', async () => {
    refuseWith('to', 'Choose how to close it.')
    inProvider(<CloseStepForm request={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close the request' }))
    await expectRefusalBeside(screen.getByLabelText(/^Close it as/), 'Choose how to close it.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
