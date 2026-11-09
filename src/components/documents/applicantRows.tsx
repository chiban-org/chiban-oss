import { Minus } from 'lucide-react'
import { ChecklistItem, type ItemProps } from '@/components/documents/ChecklistItem'
import { LiveRowGate, type LiveRule, NotNeededGroup } from '@/components/documents/LiveChecklist'
import type { ChecklistRow } from '@/features/applications/documentChecklistView'
import { isSettledStatus } from '@/features/applications/liveChecklist'

type RowProps = Omit<ItemProps, 'row'>

export function ruleOf(row: ChecklistRow): LiveRule {
  return { status: row.status, requiredIf: row.requiredIf, optional: row.optional }
}

function isConditional(row: ChecklistRow): boolean {
  return row.requiredIf !== null && !isSettledStatus(row.status)
}

export function ApplicantRow({ row, props }: { row: ChecklistRow; props: RowProps }) {
  if (!isConditional(row)) {
    return row.status === 'not_needed' ? null : <ChecklistItem {...props} row={row} />
  }
  const needed: ChecklistRow = { ...row, status: row.optional ? 'optional' : 'missing' }
  return (
    <LiveRowGate rule={ruleOf(row)} show="needed">
      <ChecklistItem {...props} row={needed} />
    </LiveRowGate>
  )
}

function NotNeededItem({ row }: { row: ChecklistRow }) {
  return (
    <li className="flex items-start gap-2 border-b border-hairline py-3">
      <Minus className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="m-0 font-medium">{row.label}</p>
        {row.neededWhen === null ? null : <p className="m-0">{row.neededWhen}</p>}
        {row.help === null ? null : <p className="m-0 text-muted-foreground">{row.help}</p>}
      </div>
    </li>
  )
}

export function NotNeededRows({ rows }: { rows: ChecklistRow[] }) {
  const candidates = rows.filter((row) => isConditional(row) || row.status === 'not_needed')
  if (candidates.length === 0) return null
  return (
    <NotNeededGroup rules={candidates.map(ruleOf)}>
      {candidates.map((row) => (
        <LiveRowGate key={row.key} rule={ruleOf(row)} show="not_needed">
          <NotNeededItem row={row} />
        </LiveRowGate>
      ))}
    </NotNeededGroup>
  )
}
