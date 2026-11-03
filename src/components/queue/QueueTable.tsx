'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { AssignReviewerDialog, type QueueReviewer } from '@/components/queue/AssignReviewerDialog'
import { ApplicationCell, DueCell, FeesCell, ReviewersCell } from '@/components/queue/QueueCells'
import { useQueueKeys } from '@/components/queue/useQueueKeys'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { ActionResult } from '@/server/actionRunner'

export type { QueueReviewer } from '@/components/queue/AssignReviewerDialog'

interface Props {
  rows: WorkQueueRow[]
  reviewers: QueueReviewer[]
  assign: (formData: FormData) => Promise<ActionResult>
  navigate?: (url: string) => void
  empty?: ReactNode
}

const ROW_CLASS =
  'cursor-pointer md:aria-selected:bg-canvas max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3'

const SELECTED_EDGE = 'md:[[aria-selected=true]>&]:shadow-[inset_3px_0_0_var(--action)]'

function EmptyQueue({ children }: { children: ReactNode }) {
  return (
    <div className="table-panel">
      <div className="px-5 py-8">{children}</div>
    </div>
  )
}

export function QueueTable({ rows, reviewers, assign, navigate, empty }: Props) {
  const router = useRouter()
  const body = useRef<HTMLTableSectionElement>(null)
  const [selected, setSelected] = useState(0)
  const [assigning, setAssigning] = useState<WorkQueueRow | null>(null)
  const go = navigate ?? ((url: string) => router.push(url))
  const canAssign = reviewers.length > 0
  const assignRow = (index: number) => setAssigning(rows.at(index) ?? null)
  const scrollPending = useRef(false)
  useEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    body.current?.rows.item(selected)?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  useQueueKeys({
    count: rows.length,
    selected,
    paused: assigning !== null,
    step: (delta) => {
      scrollPending.current = true
      setSelected((current) => Math.min(rows.length - 1, Math.max(0, current + delta)))
    },
    open: (index) => {
      const row = rows.at(index)
      if (row !== undefined) go(`/staff/applications/${row.applicationId}`)
    },
    assign: canAssign ? assignRow : null,
  })
  if (rows.length === 0) {
    return <EmptyQueue>{empty ?? <p>Nothing matches these filters.</p>}</EmptyQueue>
  }
  return (
    <>
      <div className="table-panel">
        <table className="w-full text-sm max-md:block">
          <thead className="max-md:sr-only">
            <tr>
              <th scope="col">Application</th>
              <th scope="col">Status</th>
              <th scope="col">Due</th>
              <th scope="col" className="md:text-right">
                Fees
              </th>
              <th scope="col">Reviewers</th>
            </tr>
          </thead>
          <tbody ref={body} className="max-md:block">
            {rows.map((row, index) => (
              <tr
                key={row.applicationId}
                aria-selected={index === selected}
                onClick={() => setSelected(index)}
                className={ROW_CLASS}
              >
                <ApplicationCell row={row} edgeClass={SELECTED_EDGE} />
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
                <ReviewersCell row={row} onAssign={canAssign ? () => assignRow(index) : null} />
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
