import type { ReactNode } from 'react'
import type { VersionRowView } from '@/features/config/settingsViews'

const STATUS_LABEL = { draft: 'Draft', published: 'Published', superseded: 'Superseded' } as const

function formatInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

export function VersionHistory({
  rows,
  timeZone,
  rollbackSlot,
}: {
  rows: VersionRowView[]
  timeZone: string
  rollbackSlot?: (row: VersionRowView) => ReactNode
}) {
  if (rows.length === 0) return <p>No versions yet.</p>
  return (
    <table className="my-3 w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-1">Version</th>
          <th>Status</th>
          <th>Published</th>
          <th>Upstream template</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b align-top">
            <td className="py-1">{`Version ${row.version}`}</td>
            <td>
              {STATUS_LABEL[row.status]}
              {row.rolledBackFrom === null ? null : (
                <span className="block text-muted-foreground">{`Restored from version ${row.rolledBackFrom}`}</span>
              )}
            </td>
            <td>
              {row.publishedAt === null
                ? 'Not published'
                : `${row.publishedBy ?? 'Unknown'} on ${formatInZone(row.publishedAt, timeZone)}`}
            </td>
            <td>
              {row.upstream === null
                ? 'None'
                : `${row.upstream.id} version ${row.upstream.version}`}
            </td>
            <td>{row.status === 'superseded' ? rollbackSlot?.(row) : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
