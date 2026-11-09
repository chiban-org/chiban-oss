import type { ReactNode } from 'react'
import { AccountNav } from '@/components/public/AccountNav'
import { MenuDisclosure } from '@/components/public/MenuDisclosure'
import { NavLinks } from '@/components/public/NavLinks'
import { type NavLink, PRIMARY_NAV } from '@/features/publicSite/publicNav'
import type { PublicTown } from '@/features/town/publicTown'

interface TownHeaderProps {
  town: PublicTown
  account?: { links: readonly NavLink[]; signOut?: ReactNode }
}

function TownBrand({ town }: { town: PublicTown }) {
  return (
    <a
      href="/"
      className="tap-target mr-auto inline-flex items-center gap-3 py-1 font-serif text-xl font-semibold text-ink no-underline md:text-2xl"
    >
      {town.logo === null ? null : (
        <img
          src={town.logo.src}
          width={town.logo.width}
          height={town.logo.height}
          alt=""
          className="h-10 w-auto"
        />
      )}
      <span>{town.name}</span>
    </a>
  )
}

export function TownHeader({ town, account }: TownHeaderProps) {
  const scope = [...PRIMARY_NAV, ...(account?.links ?? [])]
  return (
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2 md:pb-1">
        <TownBrand town={town} />
        <MenuDisclosure>
          <nav
            aria-label="Main"
            className="flex flex-col md:order-2 md:basis-full md:flex-row md:items-center md:gap-2 md:border-t md:border-hairline md:pt-1"
          >
            <NavLinks links={PRIMARY_NAV} scope={scope} />
          </nav>
          {account === undefined ? null : (
            <AccountNav links={account.links} scope={scope} signOut={account.signOut} />
          )}
        </MenuDisclosure>
      </div>
    </header>
  )
}
