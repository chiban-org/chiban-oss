import { NH_STARTERS } from '@packs/nh/starters'
import type { ReactNode } from 'react'
import { VersionChanges } from '@/components/config/VersionChanges'
import { StatusChip } from '@/components/StatusChip'
import type { VersionRowView } from '@/features/config/settingsViews'
import { formatInstantLong } from '@/lib/formatDate'
import { words } from '@/lib/words'

const STATUS_LABEL = { draft: 'Draft', published: 'In use', superseded: 'Replaced' } as const

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
  if (rows.length === 0)
    return <p>Nothing is saved yet. Save a draft or put it into use to start the history.</p>
  return (
    <div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Put into use</th>
              <th>Started from</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td>{`Version ${row.version}`}</td>
                <td>
                  <StatusChip
                    status={row.status === 'published' ? 'passed' : 'neutral'}
                    label={STATUS_LABEL[row.status]}
                  />
                  {row.rolledBackFrom === null ? null : (
                    <span className="block text-muted-foreground">{`Restored from version ${row.rolledBackFrom}`}</span>
                  )}
                </td>
                <td>
                  {row.publishedAt === null
                    ? 'Not in use yet'
                    : `${row.publishedBy ?? 'Unknown'} on ${formatInstantLong(row.publishedAt, timeZone)}`}
                </td>
                <td>{row.upstream === null ? 'Made by the town' : upstreamText(row.upstream)}</td>
                <td>{row.status === 'superseded' ? rollbackSlot?.(row) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) =>
          row.changes === undefined ? null : (
            <VersionChanges key={row.id} version={row.version} changes={row.changes} />
          ),
        )}
      </div>
    </div>
  )
}
