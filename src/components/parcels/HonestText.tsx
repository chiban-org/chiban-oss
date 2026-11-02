import type { ReactNode } from 'react'
import type { HonestValue } from '@/features/honest/honest'
import { formatInstantDate } from '@/lib/formatDate'

interface HonestTextProps<T> {
  value: HonestValue<T>
  format?: (value: T) => ReactNode
  timeZone?: string
}

const DEFAULT_TIME_ZONE = 'America/New_York'

function Note({ children }: { children: ReactNode }) {
  return <span className="block text-sm text-muted-foreground">{children}</span>
}

export function HonestText<T>({ value, format, timeZone = DEFAULT_TIME_ZONE }: HonestTextProps<T>) {
  const show = (v: T): ReactNode => (format === undefined ? String(v) : format(v))
  const day = (iso: string) => formatInstantDate(new Date(iso), timeZone)
  switch (value.state) {
    case 'known':
      return <span>{show(value.value)}</span>
    case 'stale':
      return (
        <span>
          <span>{show(value.value)}</span>
          <Note>{`Stale: last imported ${day(value.asOf)}, older than ${value.staleAfterDays} days`}</Note>
        </span>
      )
    case 'import_failed':
      return (
        <span>
          {value.value === null ? <span>Unknown</span> : <span>{show(value.value)}</span>}
          <Note>{`Last import failed ${day(value.lastFailureAt)}`}</Note>
        </span>
      )
    case 'unknown':
      return <span>Unknown</span>
    case 'not_applicable':
      return <span>Not applicable</span>
  }
}
