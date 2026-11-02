import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ServiceNotice } from '@/components/ServiceNotice'
import { navItemsFor } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { currentServiceState } from '@/features/town/serviceStatus'
import { createContext } from '@/server/trpc/context'

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { actor, db, signal } = await createContext()
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')
  const service = await currentServiceState(db, new Date(), signal)
  const navItems = navItemsFor(await loadNavViewer(db, actor, signal))
  return (
    <div className="staff-shell flex min-h-screen flex-col md:flex-row">
      <details className="no-print border-b bg-surface p-3 md:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center font-serif text-xl font-semibold">
          Chiban menu
        </summary>
        <ul className="m-0 flex list-none flex-col p-0">
          {navItems.map((item) => (
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
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block rounded-md px-2 py-1.5 text-ink-secondary">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 p-4 md:p-6">
        <ServiceNotice mode={service.mode} exportUntil={service.exportUntil} />
        {children}
      </div>
    </div>
  )
}
