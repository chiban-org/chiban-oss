'use client'

import { type ReactNode, useState } from 'react'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { SortBar, SortHeader } from '@/components/dataTable/SortHeader'
import { AssignReviewerDialog, type QueueReviewer } from '@/components/queue/AssignReviewerDialog'
import {
  ApplicationCell,
  DueCell,
  FeesCell,
  ParcelCell,
  ReceivedCell,
  ResponsibleCell,
  ReviewersCell,
} from '@/components/queue/QueueCells'
import type { SortLink } from '@/features/dataTable/sort'
import type { QueueSortKey } from '@/features/queue/queueParams'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { ActionResult } from '@/server/actionRunner'

export type { QueueReviewer } from '@/components/queue/AssignReviewerDialog'

interface Props {
  rows: WorkQueueRow[]
  reviewers: QueueReviewer[]
  assign: (formData: FormData) => Promise<ActionResult>
  empty?: ReactNode
  sort?: Record<QueueSortKey, SortLink>
}

function sortOptions(sort: Record<QueueSortKey, SortLink>) {
  return [
    { label: 'Number', link: sort.number },
    { label: 'Parcel', link: sort.parcel },
    { label: 'Status', link: sort.status },
    { label: 'Due', link: sort.due },
    { label: 'Fees', link: sort.fees },
    { label: 'Reviewers', link: sort.reviewers },
    { label: 'Responsible', link: sort.responsible },
    { label: 'Received', link: sort.received },
  ]
}

function QueueHead({ sort }: { sort: Record<QueueSortKey, SortLink> | undefined }) {
  return (
    <thead className="max-md:hidden">
      <tr>
        <SortHeader label="Application" link={sort?.number} />
        <SortHeader label="Parcel" link={sort?.parcel} />
        <SortHeader label="Status" link={sort?.status} />
        <SortHeader label="Due" link={sort?.due} />
        <SortHeader label="Fees" link={sort?.fees} className="md:text-right" />
        <SortHeader label="Reviewers" link={sort?.reviewers} />
        <SortHeader label="Responsible" link={sort?.responsible} />
        <SortHeader label="Received" link={sort?.received} />
      </tr>
    </thead>
  )
}

const ROW_CLASS =
  'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3'

function EmptyQueue({ children }: { children: ReactNode }) {
  return (
    <div className="table-panel">
      <div className="px-5 py-8">{children}</div>
    </div>
  )
}

export function QueueTable({ rows, reviewers, assign, empty, sort }: Props) {
  const [assigning, setAssigning] = useState<WorkQueueRow | null>(null)
  const canAssign = reviewers.length > 0
  if (rows.length === 0) {
    return <EmptyQueue>{empty ?? <p>Nothing matches these filters.</p>}</EmptyQueue>
  }
  return (
    <>
      {sort === undefined ? null : (
        <SortBar className="mb-3 md:hidden" options={sortOptions(sort)} />
      )}
      <div className="table-panel">
        <table className="w-full text-sm max-md:block">
          <QueueHead sort={sort} />
          <tbody className="max-md:block">
            {rows.map((row) => (
              <tr key={row.applicationId} className={ROW_CLASS}>
                <ApplicationCell row={row} />
                <ParcelCell row={row} />
                <td
                  data-label="Status"
                  className="max-md:block max-md:max-w-44 max-md:justify-self-end max-md:p-0"
                >
                  <ApplicationStatusChip
                    state={row.state}
                    substep={row.substep}
                    substepLabel={row.substepLabel}
                  />
                </td>
                <DueCell row={row} />
                <FeesCell cents={row.feesDueCents} />
                <ReviewersCell row={row} onAssign={canAssign ? () => setAssigning(row) : null} />
                <ResponsibleCell name={row.responsible} />
                <ReceivedCell row={row} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AssignReviewerDialog
        row={assigning}
        reviewers={reviewers}
        assign={assign}
        onClose={() => setAssigning(null)}
      />
    </>
  )
}
