'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField } from '@/components/staff/fields'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { applicationStatusText } from '@/features/applications/statusText'
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
    <span>No clock running</span>
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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Application</th>
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
              className={`border-b align-top ${index === selected ? 'bg-highlight' : ''}`}
            >
              <td className="py-2">
                <Link
                  href={`/staff/applications/${row.applicationId}`}
                  className="text-action underline"
                >
                  {row.number}
                </Link>
                <span className="block text-muted-foreground">
                  {`${row.typeLabel}${row.parcelDisplayId === null ? '' : `, ${row.parcelDisplayId}`}`}
                </span>
              </td>
              <td>
                {applicationStatusText(
                  row.state,
                  row.substep,
                  row.substep === null || row.substepLabel === null
                    ? []
                    : [{ key: row.substep, label: row.substepLabel }],
                )}
              </td>
              <td>
                <DueChip row={row} />
                <BoardDates row={row} />
              </td>
              <td>{row.feesDueCents > 0 ? `${formatCents(row.feesDueCents)} due` : ''}</td>
              <td>
                {row.reviewers.length === 0
                  ? 'Unassigned'
                  : row.reviewers
                      .map((r) => `${r.name} (${reviewStatusLabel(r.status)})`)
                      .join(', ')}
              </td>
              <td className="space-y-1">
                {row.unknownPayment ? <span className="block">Payment outcome unknown</span> : null}
                {row.preservationIncomplete ? (
                  <span className="block">Preservation incomplete</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
