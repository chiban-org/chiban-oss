import Link from 'next/link'
import type { HomeSection } from '@/features/staffHome/homeTypes'
import { shownRows } from '@/features/staffHome/startPage'
import { HomeDetailBlock } from './HomeDetails'

export function HomeSectionPanel({ section }: { section: HomeSection }) {
  const rows = shownRows(section)
  const headingId = `home-${section.key}`
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{section.title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing waiting.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.href + row.label} className="py-3">
              <Link href={row.href} className="flex items-baseline gap-4">
                <span className="w-10 text-right text-2xl font-semibold tabular-nums text-ink">
                  {row.count}
                </span>
                <span className="flex-1">{row.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <HomeDetailBlock detail={section.detail} />
      {section.links.length === 0 ? null : (
        <p className="flex flex-wrap gap-x-5 gap-y-2">
          {section.links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </p>
      )}
    </section>
  )
}
