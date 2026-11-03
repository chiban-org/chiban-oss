'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { StatusChip } from '@/components/StatusChip'
import { SelectField } from '@/components/staff/fields'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import type { ActionResult } from '@/server/actionRunner'

export interface QueueReviewer {
  id: string
  name: string
}

interface Props {
  rows: WorkQueueRow[]
  reviewers: QueueReviewer[]
  assign: (formData: FormData) => Promise<ActionResult>
  navigate?: (url: string) => void
}

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function typingInField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (TEXT_ENTRY.has(target.tagName) || target.isContentEditable)
  )
}

function DueChip({ row }: { row: WorkQueueRow }) {
  if (row.dueStatus === 'overdue') return <StatusChip status="overdue" label="Overdue" />
  if (row.dueStatus === 'warning') {
    return (
      <span className="rounded-md bg-highlight px-2 py-1 font-semibold">{`Due in ${row.daysUntilDue} days`}</span>
    )
  }
  return row.nextDue === null ? (
    <span className="text-muted-foreground">No clock running</span>
  ) : (
    <span>{formatCivilDate(row.nextDue)}</span>
  )
}

function BoardDates({ row }: { row: WorkQueueRow }) {
  return (
    <>
      {row.noticeDue === null ? null : (
        <span className="block">{`Notice due ${formatCivilDate(row.noticeDue)}`}</span>
      )}
      {row.filingDue === null ? null : (
        <span className="block">{`Filing due ${formatCivilDate(row.filingDue)}`}</span>
      )}
    </>
  )
}

function useQueueKeys(
  rows: WorkQueueRow[],
  selected: number,
  setSelected: (next: (current: number) => number) => void,
  open: (id: string) => void,
  onAssign: () => void,
) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typingInField(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'j') setSelected((c) => Math.min(rows.length - 1, c + 1))
      else if (event.key === 'k') setSelected((c) => Math.max(0, c - 1))
      else if (event.key === 'Enter' && rows[selected] !== undefined)
        open(rows[selected].applicationId)
      else if (event.key === 'a' && rows[selected] !== undefined) onAssign()
      else if (event.key === '/') {
        event.preventDefault()
        document.getElementById('queue-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selected, setSelected, open, onAssign])
}

export function QueueTable({ rows, reviewers, assign, navigate }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState(-1)
  const [assigning, setAssigning] = useState<WorkQueueRow | null>(null)
  const go = navigate ?? ((url: string) => router.push(url))
  useQueueKeys(
    rows,
    selected,
    setSelected,
    (id) => go(`/staff/applications/${id}`),
    () => setAssigning(rows[selected] ?? null),
  )
  if (rows.length === 0) return <p>Nothing matches these filters.</p>
  return (
    <>
      <div className="table-panel">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Application</th>
              <th>Status</th>
              <th>Due</th>
              <th>Fees</th>
              <th>Reviewers</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.applicationId}
                aria-selected={index === selected}
                className={index === selected ? 'bg-highlight' : undefined}
              >
                <td>
                  <Link href={`/staff/applications/${row.applicationId}`} className="font-semibold">
                    {row.number}
                  </Link>
                  <span className="block text-muted-foreground">
                    {`${row.typeLabel}${row.parcelDisplayId === null ? '' : `, ${row.parcelDisplayId}`}`}
                  </span>
                </td>
                <td>
                  <ApplicationStatusChip
                    state={row.state}
                    substep={row.substep}
                    substepLabel={row.substepLabel}
                  />
                </td>
                <td>
                  <DueChip row={row} />
                  <BoardDates row={row} />
                </td>
                <td className="whitespace-nowrap tabular-nums">
                  {row.feesDueCents > 0 ? `${formatCents(row.feesDueCents)} due` : ''}
                </td>
                <td className={row.reviewers.length === 0 ? 'text-muted-foreground' : undefined}>
                  {row.reviewers.length === 0
                    ? 'Unassigned'
                    : row.reviewers
                        .map((r) => `${r.name} (${reviewStatusLabel(r.status)})`)
                        .join(', ')}
                </td>
                <td>
                  <span className="flex flex-col items-start gap-1">
                    {row.unknownPayment ? (
                      <StatusChip status="overdue" label="Payment outcome unknown" />
                    ) : null}
                    {row.preservationIncomplete ? (
                      <StatusChip status="overdue" label="Preservation incomplete" />
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={assigning !== null}
        onOpenChange={(open) => (open ? undefined : setAssigning(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a reviewer</DialogTitle>
            <DialogDescription>
              {assigning === null ? '' : `Application ${assigning.number}`}
            </DialogDescription>
          </DialogHeader>
          {assigning === null ? null : (
            <ActionForm action={assign} submitLabel="Assign" variant="default">
              <input type="hidden" name="applicationId" value={assigning.applicationId} />
              <SelectField
                label="Reviewer"
                name="reviewerUserId"
                options={reviewers.map((r): [string, string] => [r.id, r.name])}
              />
            </ActionForm>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
