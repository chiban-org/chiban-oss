import { render } from '@testing-library/react'
import { CsrfProvider } from '@/components/CsrfProvider'
import { QueueTable } from '@/components/queue/QueueTable'
import { applicationStatusText } from '@/features/applications/statusText'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { CivilDate } from '@/types/civilDate'

export const d = (value: string) => value as CivilDate

export function row(overrides: Partial<WorkQueueRow>): WorkQueueRow {
  const base: Omit<WorkQueueRow, 'statusText'> = {
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
  const declared =
    base.substep === null || base.substepLabel === null
      ? []
      : [{ key: base.substep, label: base.substepLabel }]
  return {
    ...base,
    statusText: applicationStatusText(base.state, base.substep, declared),
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
