'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import type { SortLink } from '@/features/dataTable/sort'
import type { CaseSortKey } from '@/features/enforcement/caseListParams'
import type { QueueRow } from '@/features/enforcement/caseQueue'
import { formatCivilDate } from '@/lib/formatDate'

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function typingInField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (TEXT_ENTRY.has(target.tagName) || target.isContentEditable)
  )
}

export function EnforcementQueueTable({
  rows,
  links,
}: {
  rows: QueueRow[]
  links: Record<CaseSortKey, SortLink>
}) {
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
  if (rows.length === 0) return <p className="px-5 py-8">No cases match.</p>
  return (
    <table className="w-full min-w-[44rem] text-left">
      <thead>
        <tr>
          <SortHeader label="Case" link={links.number} />
          <SortHeader label="Where" link={links.where} />
          <SortHeader label="Status" link={links.status} />
          <SortHeader label="Opened" link={links.opened} />
          <SortHeader label="Next date" link={links.next} />
          <SortHeader label="Appeal stay" link={links.stay} />
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
              <Link href={`/staff/enforcement/${row.caseId}`}>{row.number}</Link>
            </td>
            <td>{row.locationText}</td>
            <td>
              <StatusChip status={row.statusChip} label={row.statusLabel} />
            </td>
            <td>{formatCivilDate(row.openedOn)}</td>
            <td>
              {row.nextDue === null ? (
                <span className="text-muted-foreground">None running</span>
              ) : (
                <span
                  className={
                    row.nextDue.label === 'Answer overdue' ? 'attention font-semibold' : undefined
                  }
                >
                  {`${row.nextDue.label} ${formatCivilDate(row.nextDue.date)}`}
                </span>
              )}
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
