import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { QueueTable } from '@/components/queue/QueueTable'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { CivilDate } from '@/types/civilDate'

export const d = (value: string) => value as CivilDate

export function row(overrides: Partial<WorkQueueRow>): WorkQueueRow {
  return {
    applicationId: crypto.randomUUID(),
    number: 'BP-2027-0001',
    typeLabel: 'Building permit',
    state: 'submitted',
    substep: null,
    substepLabel: null,
    parcelDisplayId: '007001000000',
    nextDue: null,
    nextDueLabel: null,
    daysUntilDue: null,
    dueStatus: 'none',
    noticeDue: null,
    noticeOverdue: false,
    filingDue: null,
    filingOverdue: false,
    feesDueCents: 0,
    unknownPayment: false,
    reviewers: [],
    preservationIncomplete: false,
    ...overrides,
  }
}

const reviewers = [{ id: 'r1', name: 'Remy Reviewer' }]
const noopAssign = () => Promise.resolve({ ok: true as const, message: 'Assigned.' })

export function setup(rows: WorkQueueRow[], navigate = vi.fn(), choices = reviewers) {
  render(
    <CsrfProvider token="t1">
      <QueueTable rows={rows} reviewers={choices} assign={noopAssign} navigate={navigate} />
    </CsrfProvider>,
  )
  return navigate
}

export const key = (k: string, target: Element = document.body) =>
  fireEvent.keyDown(target, { key: k })
export const selectedNumber = () =>
  document.querySelector('tbody tr[aria-selected="true"] a')?.textContent ?? null
