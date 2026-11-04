import Link from 'next/link'
import { searchHref } from '@/features/parcels/recentSearches'
import type { SearchExample } from '@/features/parcels/searchExample'

export function SearchExamples({
  example,
  hrefBase,
  query,
}: {
  example: SearchExample | null
  hrefBase: string
  query?: Readonly<Record<string, string>>
}) {
  if (example === null) return null
  const tries = [example.address, example.displayId].filter((v): v is string => v !== null)
  if (tries.length === 0) return null
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-muted-foreground">Try</span>
      {tries.map((value) => (
        <Link key={value} href={searchHref(hrefBase, 'q', value, query)}>
          {value}
        </Link>
      ))}
    </p>
  )
}
