import Link from 'next/link'
import type { ChipView } from '@/features/dataTable/quickFilters'
import { cn } from '@/lib/utils'

export function FilterTabs({ label, tabs }: { label: string; tabs: ChipView[] }) {
  return (
    <nav aria-label={label} className="mb-4 border-b border-hairline">
      <ul className="-mb-px flex flex-wrap gap-x-6">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-sm whitespace-nowrap no-underline transition-colors',
                tab.active
                  ? 'border-action font-semibold text-ink'
                  : 'border-transparent text-muted-foreground hover:border-control-border hover:text-ink',
              )}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span className="font-normal text-muted-foreground tabular-nums">{tab.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
