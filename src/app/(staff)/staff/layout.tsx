import Link from 'next/link'
import type { ReactNode } from 'react'

const NAV_ITEMS = [{ href: '/staff/account', label: 'Account' }] as const

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div className="staff-shell flex min-h-screen">
      <nav aria-label="Staff" className="w-56 shrink-0 border-r bg-surface p-4">
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
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 p-6">{children}</div>
    </div>
  )
}
