import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import type { RecordRow } from '@/features/parcels/recordTable'
import { formatCivilDate } from '@/lib/formatDate'

export function RecordFiles({ record }: { record: RecordRow }) {
  return (
    <ul aria-label={`Files on ${record.number ?? record.title}`} className="m-0 list-none p-0">
      {record.files.map((file) => (
        <li
          key={file.id}
          className="grid gap-x-4 gap-y-1 border-t border-hairline py-2 first:border-t-0 md:grid-cols-[minmax(0,1fr)_11rem_6rem_10rem] md:items-center"
        >
          {file.href === null ? (
            <span>{file.title}</span>
          ) : (
            <Link href={file.href} className="min-w-0 break-words">
              {file.title}
            </Link>
          )}
          <span className="text-muted-foreground">{file.kindLabel}</span>
          <span>
            <StatusChip status={file.visibility.chip} label={file.visibility.label} />
          </span>
          <span className="text-muted-foreground tabular-nums">
            {file.added === null ? 'Date not recorded' : `Added ${formatCivilDate(file.added)}`}
          </span>
        </li>
      ))}
    </ul>
  )
}
