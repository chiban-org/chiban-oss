import Link from 'next/link'

const TABS = [
  { href: '/staff/overrides/aliases', label: 'Parcel IDs' },
  { href: '/staff/overrides/clocks', label: 'Clocks' },
  { href: '/staff/overrides/fees', label: 'Fees' },
] as const

export function OverridesTabs({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Overrides" className="mb-4 flex gap-4 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? 'page' : undefined}
          className={
            tab.href === current
              ? 'border-b-2 border-action pb-2 font-semibold'
              : 'pb-2 text-action'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
