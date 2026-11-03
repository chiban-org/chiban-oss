import Link from 'next/link'

export interface TablePagerProps {
  offset: number
  shown: number
  total: number
  prevHref: string | null
  nextHref: string | null
}

export function TablePager({ offset, shown, total, prevHref, nextHref }: TablePagerProps) {
  if (prevHref === null && nextHref === null) return null
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="tabular-nums text-muted-foreground">{`${offset + 1}-${offset + shown} of ${total}`}</span>
      {prevHref === null ? null : <Link href={prevHref}>Previous page</Link>}
      {nextHref === null ? null : <Link href={nextHref}>Next page</Link>}
    </nav>
  )
}
