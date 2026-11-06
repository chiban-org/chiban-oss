import { render } from '@testing-library/react'
import { CsrfProvider } from '@/components/CsrfProvider'
import { QueueTable } from '@/components/queue/QueueTable'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { CivilDate } from '@/types/civilDate'

export const d = (value: string) => value as CivilDate

export function row(overrides: Partial<WorkQueueRow>): WorkQueueRow {
  return {
    applicationId: crypto.randomUUID(),
    number: 'BP-2027-0001',
    projectTitle: 'Garage addition',
    receivedDate: null,
    typeLabel: 'Building permit',
    state: 'submitted',
    substep: null,
    substepLabel: null,
    parcelId: 'p1',
    parcelDisplayId: '007001000000',
    nextDue: null,
    nextDueLabel: null,
    daysUntilDue: null,
    dueStatus: 'none',
    clockDue: null,
    clockDueLabel: null,
    noticeDue: null,
    noticeOverdue: false,
    filingDue: null,
    filingOverdue: false,
    feesDueCents: 0,
    unknownPayment: false,
    reviewers: [],
    responsible: null,
    preservationIncomplete: false,
    ...overrides,
  }
}

const reviewers = [{ id: 'r1', name: 'Remy Reviewer' }]
const noopAssign = () => Promise.resolve({ ok: true as const, message: 'Assigned.' })

export function setup(rows: WorkQueueRow[], choices = reviewers) {
  render(
    <CsrfProvider token="t1">
      <QueueTable rows={rows} reviewers={choices} assign={noopAssign} />
    </CsrfProvider>,
  )
}
