'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { StatusChip } from '@/components/StatusChip'
import type { QueueRow } from '@/features/enforcement/caseQueue'
import { formatCivilDate } from '@/lib/formatDate'

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function typingInField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (TEXT_ENTRY.has(target.tagName) || target.isContentEditable)
  )
}

export function EnforcementQueueTable({ rows }: { rows: QueueRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typingInField(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'j') setSelected((c) => Math.min(rows.length - 1, c + 1))
      else if (event.key === 'k') setSelected((c) => Math.max(0, c - 1))
      else if (event.key === 'Enter' && rows[selected] !== undefined) {
        router.push(`/staff/enforcement/${rows[selected].caseId}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selected, router])
  if (rows.length === 0) return <p>No cases match.</p>
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th scope="col">Case</th>
          <th scope="col">Where</th>
          <th scope="col">Status</th>
          <th scope="col">Opened</th>
          <th scope="col">Next date</th>
          <th scope="col">Appeal stay</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.caseId}
            aria-selected={index === selected}
            className={index === selected ? 'bg-highlight' : undefined}
          >
            <td>
              <Link href={`/staff/enforcement/${row.caseId}`} className="text-action underline">
                {row.number}
              </Link>
            </td>
            <td>{row.locationText}</td>
            <td>{row.statusLabel}</td>
            <td>{formatCivilDate(row.openedOn)}</td>
            <td>
              {row.nextDue === null
                ? 'None running'
                : `${row.nextDue.label} ${formatCivilDate(row.nextDue.date)}`}
            </td>
            <td>
              {row.stay.stayed ? (
                <StatusChip status="overdue" label="Stayed" />
              ) : (
                <span>Not stayed</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
