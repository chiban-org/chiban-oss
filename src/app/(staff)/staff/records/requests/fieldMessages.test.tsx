// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { RtkRequestView } from '@/features/rtk/requests'
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

vi.mock('./actions', () => ({
  logRequestAction: answer,
  firstResponseAction: answer,
  withholdingAction: answer,
  createReleaseAction: answer,
  closeRequestAction: answer,
}))
vi.mock('@/components/enforcement/DueLine', () => ({ DueLine: () => null }))
vi.mock('../renditionActions', () => ({
  approveRenditionAction: answer,
  revokeApprovalAction: answer,
}))

const { LogRequest } = await import('./LogRequestForm')
const { ResponseSection } = await import('./[requestId]/ResponseSection')
const { WithholdingsSection } = await import('./[requestId]/WithholdingsSection')
const { ReleaseSection } = await import('./[requestId]/ReleaseSection')
const { RequestRail } = await import('./[requestId]/RequestRail')

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
    inProvider(<ResponseSection request={request} today={TODAY} working />)
    open('Record the first response')
    fireEvent.change(screen.getByLabelText(/^Response/), { target: { value: 'time_statement' } })
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
        versions: [
          { id: 'v1', role: 'original', filename: 'l.pdf', createdAt: '2026-11-01T10:00:00Z' },
        ],
      },
    ]
    const find = { requestId: REQUEST_ID, find: 'Letter', userId: 'u1', example: null }
    inProvider(
      <ReleaseSection
        find={find}
        releases={[]}
        approvals={[]}
        candidates={candidates}
        today={TODAY}
        canManage
        working
      />,
    )
    const statement = screen.getByRole('textbox', { name: /What you checked/ })
    fireEvent.change(statement, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve for release' }))
    await expectRefusalBeside(statement, 'Enter a review statement.')
  })

  it('the revoke reason and the release list', async () => {
    const approval = {
      approvalId: 'a1',
      documentId: 'd1',
      versionId: 'v1',
      title: 'Letter',
      role: 'original',
      revokedAt: null,
    }
    const find = { requestId: REQUEST_ID, find: '', userId: 'u1', example: null }
    const props = {
      find,
      releases: [],
      approvals: [approval],
      candidates: [],
      today: TODAY,
      canManage: true,
      working: true,
    }
    refuseWith('reason', 'Enter a reason of at least 10 characters.')
    inProvider(<ReleaseSection {...props} />)
    open('Revoke approval')
    const reason = screen.getByRole('textbox', { name: /Why it is being revoked/ })
    fireEvent.change(reason, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke approval' }))
    await waitFor(() => expect(reason.getAttribute('aria-invalid')).toBe('true'))
  })

  it('the release list, beside its records', async () => {
    const message = 'Tick at least one approved record to release.'
    refuseWith('items', message)
    const approval = {
      approvalId: 'a1',
      documentId: 'd1',
      versionId: 'v1',
      title: 'Letter',
      role: 'original',
      revokedAt: null,
    }
    const find = { requestId: REQUEST_ID, find: '', userId: 'u1', example: null }
    inProvider(
      <ReleaseSection
        find={find}
        releases={[]}
        approvals={[approval]}
        candidates={[]}
        today={TODAY}
        canManage
        working
      />,
    )
    open('Release approved records')
    fireEvent.click(screen.getByRole('button', { name: 'Release' }))
    const box = await screen.findByRole('checkbox', { name: /Letter/ })
    await expectGroupRefusal(box, message)
  })

  it('the release date', async () => {
    refuseWith(
      'releasedOn',
      'Enter the date released between January 1, 1900 and November 6, 2026.',
    )
    const approval = {
      approvalId: 'a1',
      documentId: 'd1',
      versionId: 'v1',
      title: 'Letter',
      role: 'original',
      revokedAt: null,
    }
    const find = { requestId: REQUEST_ID, find: '', userId: 'u1', example: null }
    inProvider(
      <ReleaseSection
        find={find}
        releases={[]}
        approvals={[approval]}
        candidates={[]}
        today={TODAY}
        canManage
        working
      />,
    )
    open('Release approved records')
    fireEvent.click(screen.getByRole('checkbox', { name: /Letter/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Release' }))
    await expectRefusalBeside(
      screen.getByLabelText(/^Date released/),
      'Enter the date released between January 1, 1900 and November 6, 2026.',
    )
  })

  it('how to close the request, before the confirm opens', async () => {
    refuseWith('to', 'Choose how to close it.')
    inProvider(<RequestRail request={request} today={TODAY} canManage />)
    open('Close the request')
    fireEvent.click(screen.getByRole('button', { name: 'Close request' }))
    await expectRefusalBeside(screen.getByLabelText(/^Close it as/), 'Choose how to close it.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
