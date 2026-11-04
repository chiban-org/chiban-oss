import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import type { ChipGroupView, ChipView } from '@/features/dataTable/quickFilters'
import { cn } from '@/lib/utils'
import { FilterMenu } from './FilterMenu'

function Segment({ chip }: { chip: ChipView }) {
  return (
    <Link
      href={chip.href}
      aria-current={chip.active ? 'true' : undefined}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 px-3 text-sm whitespace-nowrap no-underline transition-colors',
        chip.active
          ? 'bg-action/10 font-semibold text-action'
          : chip.count === 0
            ? 'text-muted-foreground hover:bg-canvas'
            : 'text-ink hover:bg-canvas',
      )}
    >
      {chip.active ? <Check aria-hidden={true} className="size-3.5 shrink-0" /> : null}
      {chip.label}
      {chip.count === undefined ? null : (
        <span className="font-normal text-muted-foreground tabular-nums">{chip.count}</span>
      )}
    </Link>
  )
}

function InlineGroup({ group }: { group: ChipGroupView }) {
  return (
    <div
      role="group"
      aria-label={group.label}
      className="inline-flex divide-x divide-hairline overflow-hidden rounded-md border border-hairline bg-surface max-sm:hidden"
    >
      {group.chips.map((chip) => (
        <Segment key={chip.href} chip={chip} />
      ))}
    </div>
  )
}

function ActiveMenuChips({ groups }: { groups: ChipGroupView[] }) {
  const active = groups
    .filter((group) => group.display === 'menu')
    .flatMap((group) => group.chips.filter((chip) => chip.active).map((chip) => ({ group, chip })))
  if (active.length === 0) return null
  return (
    <ul className="flex w-full flex-wrap items-center gap-2" aria-label="Active filters">
      {active.map(({ group, chip }) => (
        <li key={chip.href}>
          <Badge
            asChild
            variant="outline"
            className="gap-1.5 border-action/40 bg-action/10 py-0.5 pr-1.5 pl-3 text-sm font-normal text-action no-underline hover:border-action [a&]:hover:bg-action/10 [a&]:hover:text-action [&>svg]:size-3.5"
          >
            <Link href={chip.href} aria-label={`Remove ${group.label} filter ${chip.label}`}>
              {chip.label}
              <X aria-hidden={true} />
            </Link>
          </Badge>
        </li>
      ))}
    </ul>
  )
}

export function QuickFilters({
  label,
  groups,
  clearHref,
  className,
}: {
  label: string
  groups: ChipGroupView[]
  clearHref: string | null
  className?: string
}) {
  const shown = groups.filter((group) => group.chips.length > 0)
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {shown.map((group) =>
        group.display === 'menu' ? (
          <FilterMenu key={group.label} group={group} />
        ) : (
          <Fragment key={group.label}>
            <InlineGroup group={group} />
            <span data-phone-menu="" className="sm:hidden">
              <FilterMenu group={group} />
            </span>
          </Fragment>
        ),
      )}
      {clearHref === null ? null : (
        <Link href={clearHref} className="ml-1 text-sm">
          Clear all
        </Link>
      )}
      <ActiveMenuChips groups={shown} />
    </div>
  )
}
