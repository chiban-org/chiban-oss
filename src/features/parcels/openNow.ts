import { isInForce, OPEN_GROUPS, type OpenGroup } from '@/features/parcels/openGroups'
import type { RecordRow } from '@/features/parcels/recordTable'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const WORDS = new Map<OpenGroup, readonly [string, string]>([
  ['case', ['enforcement case', 'enforcement cases']],
  ['permit_review', ['permit in review', 'permits in review']],
  ['board_review', ['board application in review', 'board applications in review']],
  ['permit_to_issue', ['permit approved, not yet issued', 'permits approved, not yet issued']],
  ['permit_suspended', ['suspended permit', 'suspended permits']],
  ['permit_in_force', ['permit in force', 'permits in force']],
  ['board_in_force', ['board approval in force', 'board approvals in force']],
  ['inspection_scheduled', ['inspection scheduled', 'inspections scheduled']],
  ['inspection_requested', ['inspection request', 'inspection requests']],
  ['draft', ['draft application', 'draft applications']],
])

export const NOTHING_OPEN = 'Nothing open on this lot.'

type Grouped = Pick<RecordRow, 'openAs'>

function countOf(rows: readonly Grouped[], group: OpenGroup): number {
  return rows.filter((r) => r.openAs === group).length
}

function phrase(group: OpenGroup, count: number): string {
  const [one, many] = WORDS.get(group) ?? [group, group]
  return `${count} ${count === 1 ? one : many}`
}

export function openNowSentence(rows: readonly Grouped[]): string {
  const parts = OPEN_GROUPS.flatMap((group) => {
    const count = countOf(rows, group)
    return count === 0 ? [] : [phrase(group, count)]
  })
  return parts.length === 0 ? NOTHING_OPEN : `Open: ${parts.join(', ')}.`
}

export interface OpenItem {
  key: string
  recordId: string
  group: OpenGroup
  label: string
  sublabel: string | null
  href: string | null
  status: RecordRow['status']
  next: string | null
}

function dated(prefix: string, date: CivilDate | null): string | null {
  return date === null ? null : `${prefix} ${formatCivilDate(date)}`
}

function nextOf(row: RecordRow, group: OpenGroup): string | null {
  if (group === 'inspection_scheduled') return dated('Scheduled', row.scheduled)
  if (group === 'inspection_requested') return dated('Requested', row.dates.filed)
  if (group === 'case') return dated('Opened', row.dates.filed)
  if (isInForce(group)) {
    return (
      dated('Expires', row.dates.expires) ??
      dated('Issued', row.dates.issued) ??
      dated('Decided', row.dates.closed)
    )
  }
  return dated('Filed', row.dates.filed)
}

function sortDate(row: RecordRow): string {
  return row.scheduled ?? row.dates.expires ?? row.dates.filed ?? ''
}

export function openItems(rows: readonly RecordRow[]): OpenItem[] {
  return rows
    .flatMap((row) => (row.openAs === null ? [] : [{ row, group: row.openAs }]))
    .sort(
      (a, b) =>
        OPEN_GROUPS.indexOf(a.group) - OPEN_GROUPS.indexOf(b.group) ||
        sortDate(a.row).localeCompare(sortDate(b.row)),
    )
    .map(({ row, group }) => ({
      key: row.key,
      recordId: row.recordId,
      group,
      label: row.label,
      sublabel: row.sublabel,
      href: row.href,
      status: row.status,
      next: nextOf(row, group),
    }))
}
