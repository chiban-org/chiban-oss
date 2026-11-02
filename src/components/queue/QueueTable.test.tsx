// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { QueueTable } from '@/components/queue/QueueTable'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { CivilDate } from '@/types/civilDate'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

afterEach(cleanup)

const d = (value: string) => value as CivilDate

function row(overrides: Partial<WorkQueueRow>): WorkQueueRow {
  return {
    applicationId: crypto.randomUUID(),
    number: 'BP-2027-0001',
    typeLabel: 'Building permit',
    state: 'submitted',
    substep: null,
    parcelDisplayId: '007001000000',
    nextDue: null,
    daysUntilDue: null,
    dueStatus: 'none',
    feesDueCents: 0,
    unknownPayment: false,
    reviewers: [],
    preservationIncomplete: false,
    ...overrides,
  }
}

const reviewers = [{ id: 'r1', name: 'Remy Reviewer' }]
const noopAssign = () => Promise.resolve({ ok: true as const, message: 'Assigned.' })

function setup(rows: WorkQueueRow[], navigate = vi.fn()) {
  render(
    <CsrfProvider token="t1">
      <QueueTable rows={rows} reviewers={reviewers} assign={noopAssign} navigate={navigate} />
    </CsrfProvider>,
  )
  return navigate
}

describe('QueueTable', () => {
  it('queue row shows the overdue chip with a text label', () => {
    setup([row({ dueStatus: 'overdue', nextDue: d('2027-03-01'), daysUntilDue: -1 })])
    expect(screen.getByText('Overdue')).toBeTruthy()
  })

  it('warns with the highlight phrase within five days', () => {
    setup([row({ dueStatus: 'warning', nextDue: d('2027-03-05'), daysUntilDue: 3 })])
    expect(screen.getByText('Due in 3 days')).toBeTruthy()
  })

  it('shows dollars due, unknown payment, and preservation incomplete as words', () => {
    setup([row({ feesDueCents: 4635, unknownPayment: true, preservationIncomplete: true })])
    expect(screen.getByText('$46.35 due')).toBeTruthy()
    expect(screen.getByText('Payment outcome unknown')).toBeTruthy()
    expect(screen.getByText('Preservation incomplete')).toBeTruthy()
  })

  it('j and k move the selection and Enter opens the selected application', () => {
    const a = row({ number: 'BP-2027-0001' })
    const b = row({ number: 'BP-2027-0002' })
    const navigate = setup([a, b])
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(screen.getByText('BP-2027-0001').closest('tr')?.getAttribute('aria-selected')).toBe(
      'true',
    )
    fireEvent.keyDown(document.body, { key: 'j' })
    expect(screen.getByText('BP-2027-0002').closest('tr')?.getAttribute('aria-selected')).toBe(
      'true',
    )
    fireEvent.keyDown(document.body, { key: 'k' })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith(`/staff/applications/${a.applicationId}`)
  })

  it('a opens the assign reviewer dialog for the selected row', () => {
    setup([row({})])
    fireEvent.keyDown(document.body, { key: 'j' })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Assign a reviewer')).toBeTruthy()
  })

  it('keys typed into a field do not trigger shortcuts', () => {
    const navigate = setup([row({})])
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'j' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).not.toHaveBeenCalled()
    input.remove()
  })

  it('says when the queue is empty', () => {
    setup([])
    expect(screen.getByText('Nothing matches these filters.')).toBeTruthy()
  })
})
