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
      {filters.length === 0 ? null : (
        <Link href="/staff/queue" className="text-action">
          Clear filters
        </Link>
      )}
    </p>
  )
}

const KEY_CLASS =
  'rounded border border-hairline bg-surface px-1.5 py-0.5 font-mono text-xs text-ink'

function Key({ children }: { children: string }) {
  return <kbd className={KEY_CLASS}>{children}</kbd>
}

export function KeyHints({ canAssign }: { canAssign: boolean }) {
  return (
    <p className="mb-5 hidden flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground md:flex">
      <span>
        <Key>j</Key> <Key>k</Key> move
      </span>
      <span>
        <Key>Enter</Key> open
      </span>
      {canAssign ? (
        <span>
          <Key>a</Key> assign a reviewer
        </span>
      ) : null}
      <span>
        <Key>/</Key> search
      </span>
    </p>
  )
}

interface PagerProps {
  offset: number
  shown: number
  total: number
  prevHref: string | null
  nextHref: string | null
}

export function QueuePager({ offset, shown, total, prevHref, nextHref }: PagerProps) {
  if (prevHref === null && nextHref === null) return null
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="tabular-nums text-muted-foreground">{`${offset + 1}-${offset + shown} of ${total}`}</span>
      {prevHref === null ? null : <Link href={prevHref}>Previous page</Link>}
      {nextHref === null ? null : <Link href={nextHref}>Next page</Link>}
    </nav>
  )
}

export function NoMatches({ filters }: { filters: string[] }) {
  if (filters.length === 0) return <p>Nothing needs action right now.</p>
  return (
    <p>
      {`No applications match ${filters.join(', ')}. `}
      <Link href="/staff/queue">Clear filters</Link>
    </p>
  )
}
