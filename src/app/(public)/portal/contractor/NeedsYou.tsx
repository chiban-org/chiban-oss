import Link from 'next/link'
import type { NeedItem } from '@/features/contractors/dashboardNeeds'

const SHOWN = 6

function NeedLine({ need }: { need: NeedItem }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span>{need.text}</span>
      <Link href={need.href} className="tap-target inline-flex items-center font-semibold">
        {need.linkLabel}
      </Link>
    </li>
  )
}

export function NeedsYou({ needs }: { needs: NeedItem[] }) {
  if (needs.length === 0) return null
  const rest = needs.slice(SHOWN)
  return (
    <section aria-labelledby="needs-heading" data-testid="needs-you">
      <h2 id="needs-heading">Needs you</h2>
      <ul className="flex list-none flex-col gap-3 p-0">
        {needs.slice(0, SHOWN).map((need) => (
          <NeedLine key={need.key} need={need} />
        ))}
      </ul>
      {rest.length === 0 ? null : (
        <details>
          <summary className="tap-target inline-flex cursor-pointer items-center">{`Show all ${needs.length}`}</summary>
          <ul className="mt-3 flex list-none flex-col gap-3 p-0">
            {rest.map((need) => (
              <NeedLine key={need.key} need={need} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
