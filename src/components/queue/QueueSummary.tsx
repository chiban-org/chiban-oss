import Link from 'next/link'

export function QueueSummary({ total, filters }: { total: number; filters: string[] }) {
  return (
    <p className="mb-1 flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold text-ink">{`${total} ${total === 1 ? 'application' : 'applications'}`}</span>
      {filters.map((label) => (
        <span key={label} className="text-muted-foreground">
          {`· ${label}`}
        </span>
      ))}
    </p>
  )
}

export function NoMatches({
  filters,
  clearHref,
  emptyText,
}: {
  filters: string[]
  clearHref: string | null
  emptyText: string
}) {
  if (filters.length === 0 || clearHref === null) return <p>{emptyText}</p>
  return (
    <p>
      {`No applications match ${filters.join(', ')}. `}
      <Link href={clearHref}>Clear filters</Link>
    </p>
  )
}
