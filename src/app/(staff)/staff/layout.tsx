import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createContext } from '@/server/trpc/context'

const NAV_ITEMS = [
  { href: '/staff/parcels', label: 'Parcels' },
  { href: '/staff/counter', label: 'Counter' },
  { href: '/staff/queue', label: 'Queue' },
  { href: '/staff/reviews', label: 'Reviews' },
  { href: '/staff/applications', label: 'Applications' },
  { href: '/staff/inspections', label: 'Inspections' },
  { href: '/staff/payments', label: 'Payments' },
  { href: '/staff/boards/packets', label: 'Board packets' },
  { href: '/staff/records/preservation', label: 'Records' },
  { href: '/staff/reports/cash-receipts', label: 'Reports' },
  { href: '/staff/map', label: 'Map' },
  { href: '/staff/gis/imports', label: 'Imports' },
  { href: '/staff/gis/exceptions', label: 'Exceptions' },
  { href: '/staff/parcels/unresolved', label: 'Unresolved records' },
  { href: '/staff/overrides/aliases', label: 'Overrides' },
  { href: '/staff/settings', label: 'Settings' },
  { href: '/staff/account', label: 'Account' },
] as const

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { actor } = await createContext()
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')
  return (
    <div className="staff-shell flex min-h-screen flex-col md:flex-row">
      <details className="no-print border-b bg-surface p-3 md:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center font-serif text-xl font-semibold">
          Chiban menu
        </summary>
        <ul className="m-0 flex list-none flex-col p-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-11 items-center px-2 text-ink-secondary">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </details>
      <nav aria-label="Staff" className="hidden w-56 shrink-0 border-r bg-surface p-4 md:block">
        <p className="mb-4 font-serif text-xl font-semibold">Chiban</p>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block rounded-md px-2 py-1.5 text-ink-secondary">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 p-4 md:p-6">
        {children}
      </div>
    </div>
  )
}
