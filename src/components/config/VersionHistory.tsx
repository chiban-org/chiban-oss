import { NH_STARTERS } from '@packs/nh/starters'
import type { ReactNode } from 'react'
import type { VersionRowView } from '@/features/config/settingsViews'
import { formatInstantLong } from '@/lib/formatDate'
import { words } from '@/lib/words'

const STATUS_LABEL = { draft: 'Draft', published: 'Published', superseded: 'Superseded' } as const

function upstreamText(upstream: { id: string; version: number }): string {
  const starter = NH_STARTERS.find((s) => s.id === upstream.id)
  const name =
    starter === undefined
      ? words(upstream.id.split('.').at(-1) ?? upstream.id)
      : `${starter.applicationType.label} starter`
  return `${name}, version ${upstream.version}`
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
                : `${row.publishedBy ?? 'Unknown'} on ${formatInstantLong(row.publishedAt, timeZone)}`}
            </td>
            <td>{row.upstream === null ? 'None' : upstreamText(row.upstream)}</td>
            <td>{row.status === 'superseded' ? rollbackSlot?.(row) : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
