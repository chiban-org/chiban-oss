import { Check } from 'lucide-react'
import Link from 'next/link'
import type { ChipGroupView, ChipView } from '@/features/dataTable/quickFilters'
import { cn } from '@/lib/utils'

const CHIP =
  'inline-flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1 text-sm no-underline'

function Chip({ chip }: { chip: ChipView }) {
  return (
    <Link
      href={chip.href}
      aria-current={chip.active ? 'true' : undefined}
      className={cn(
        CHIP,
        chip.active
          ? 'border-action font-semibold text-action'
          : chip.count === 0
            ? 'border-dashed border-hairline bg-transparent text-muted-foreground hover:border-control-border'
            : 'border-hairline text-ink hover:border-control-border',
      )}
    >
      {chip.active ? <Check aria-hidden={true} className="size-3.5 shrink-0" /> : null}
      {chip.label}
      {chip.count === undefined ? null : (
        <span className="font-normal tabular-nums text-muted-foreground">{chip.count}</span>
      )}
    </Link>
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
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-start gap-x-6 gap-y-3', className)}
    >
      {groups
        .filter((group) => group.chips.length > 0)
        .map((group) => (
          <div
            key={group.label}
            role="group"
            aria-label={group.label}
            className="flex flex-wrap items-center gap-2"
          >
            <span aria-hidden={true} className="text-sm font-semibold text-muted-foreground">
              {group.label}
            </span>
            {group.chips.map((chip) => (
              <Chip key={chip.href} chip={chip} />
            ))}
          </div>
        ))}
      {clearHref === null ? null : (
        <Link href={clearHref} className="self-center text-sm text-action underline">
          Clear filters
        </Link>
      )}
    </div>
  )
}
