'use client'

import { Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ChipGroupView } from '@/features/dataTable/quickFilters'
import { cn } from '@/lib/utils'

export function FilterMenu({ group }: { group: ChipGroupView }) {
  const activeCount = group.chips.filter((chip) => chip.active).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'gap-1.5 px-3 has-[>svg]:px-3',
            activeCount > 0
              ? 'border-action font-semibold text-action'
              : 'border-hairline font-normal hover:border-control-border hover:bg-surface',
          )}
        >
          {group.label}
          {activeCount > 0 ? (
            <Badge className="px-1.5 py-0 leading-5 font-semibold tabular-nums">
              {activeCount}
            </Badge>
          ) : null}
          <ChevronDown aria-hidden={true} className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64 bg-surface">
        {group.chips.map((chip) => (
          <DropdownMenuItem key={chip.href} asChild>
            <Link
              href={chip.href}
              aria-current={chip.active ? 'true' : undefined}
              className="flex w-full cursor-pointer items-center gap-2 text-ink no-underline"
            >
              <Check
                aria-hidden={true}
                className={cn('size-4 text-action', chip.active ? 'visible' : 'invisible')}
              />
              <span className={cn('flex-1', chip.active ? 'font-semibold' : undefined)}>
                {chip.label}
              </span>
              {chip.count === undefined ? null : (
                <span className="text-muted-foreground tabular-nums">{chip.count}</span>
              )}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
