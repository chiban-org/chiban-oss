import Link from 'next/link'
import type { NeedItem } from '@/features/contractors/dashboardNeeds'

const SHOWN = 6

export function NeedsYou({ needs }: { needs: NeedItem[] }) {
  if (needs.length === 0) return null
  const hidden = needs.length - SHOWN
  return (
    <section aria-labelledby="needs-heading" data-testid="needs-you">
      <h2 id="needs-heading">Needs you</h2>
      <ul className="flex list-none flex-col gap-3 p-0">
        {needs.slice(0, SHOWN).map((need) => (
          <li key={need.key} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>{need.text}</span>
            <Link href={need.href} className="tap-target inline-flex items-center font-semibold">
              {need.linkLabel}
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="text-muted-foreground">
          {hidden === 1
            ? '1 more item is marked on the projects below.'
            : `${hidden} more items are marked on the projects below.`}
        </p>
      ) : null}
    </section>
  )
}
