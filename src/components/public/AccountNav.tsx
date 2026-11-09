'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { NavLinks } from '@/components/public/NavLinks'
import { accountLinksAt, type NavLink } from '@/features/publicSite/publicNav'

export function AccountNav({
  links,
  scope,
  signOut,
}: {
  links: readonly NavLink[]
  scope: readonly NavLink[]
  signOut?: ReactNode
}) {
  const shown = accountLinksAt(links, usePathname())
  if (shown.length === 0 && signOut === undefined) return null
  return (
    <nav
      aria-label="Account"
      className="flex flex-col border-t border-hairline pt-2 md:order-1 md:flex-row md:flex-wrap md:items-center md:gap-1 md:border-t-0 md:pt-0"
    >
      <NavLinks links={shown} scope={scope} />
      {signOut}
    </nav>
  )
}
