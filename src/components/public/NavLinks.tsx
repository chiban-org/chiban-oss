'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { currentNavHref, type NavLink } from '@/features/publicSite/publicNav'
import { cn } from '@/lib/utils'

const LINK =
  'tap-target inline-flex items-center rounded-md px-2 font-semibold text-ink-secondary no-underline hover:text-action aria-[current=page]:text-action aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8'
const EMPHASIS = 'border border-action px-3 text-action md:ml-auto'

export function NavLinks({
  links,
  scope,
}: {
  links: readonly NavLink[]
  scope: readonly NavLink[]
}) {
  const current = currentNavHref(usePathname(), scope)
  return (
    <>
      {links.map((entry) => (
        <Link
          key={entry.href}
          href={entry.href}
          aria-current={entry.href === current ? 'page' : undefined}
          data-emphasis={entry.emphasis === true ? '' : undefined}
          className={cn(LINK, entry.emphasis === true && EMPHASIS)}
        >
          {entry.label}
        </Link>
      ))}
    </>
  )
}
