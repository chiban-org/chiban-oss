'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeNavHref, groupNavItems, type NavItem } from '@/features/staffNav/navItems'

const LINK_BASE =
  'rounded-md px-2 text-ink-secondary no-underline hover:bg-canvas aria-[current=page]:bg-canvas aria-[current=page]:font-bold aria-[current=page]:text-ink'

function NavSections({
  items,
  active,
  linkClassName,
}: {
  items: NavItem[]
  active: string | null
  linkClassName: string
}) {
  return (
    <div className="flex flex-col gap-5">
      {groupNavItems(items).map((section) => (
        <div key={section.key}>
          {section.label === null ? null : (
            <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">{section.label}</p>
          )}
          <ul className="flex flex-col gap-px">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.href === active ? 'page' : undefined}
                  className={`${LINK_BASE} ${linkClassName}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function StaffNav({ items, town }: { items: NavItem[]; town: string | null }) {
  const active = activeNavHref(usePathname(), items)
  return (
    <>
      <details className="no-print border-b bg-surface p-3 md:hidden">
        <summary className="flex min-h-11 items-center font-serif text-xl font-semibold text-ink">
          Chiban menu
        </summary>
        <div className="pt-2">
          <NavSections items={items} active={active} linkClassName="flex min-h-11 items-center" />
        </div>
      </details>
      <nav aria-label="Staff" className="hidden w-60 shrink-0 border-r bg-surface md:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto px-3 py-5">
          <Link href="/staff" className="mb-6 block px-2 text-ink no-underline">
            <span className="block font-serif text-2xl font-semibold">Chiban</span>
            {town === null ? null : (
              <span className="block text-sm text-muted-foreground">{town}</span>
            )}
          </Link>
          <NavSections items={items} active={active} linkClassName="block py-1.5 text-sm" />
        </div>
      </nav>
    </>
  )
}
