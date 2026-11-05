import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DescriptionItem {
  label: string
  value: ReactNode
}

type LabelWidth = 'narrow' | 'default' | 'wide'

function columns(width: LabelWidth): string {
  switch (width) {
    case 'narrow':
      return 'sm:grid-cols-[8rem_minmax(0,1fr)]'
    case 'wide':
      return 'sm:grid-cols-[14rem_minmax(0,1fr)]'
    case 'default':
      return 'sm:grid-cols-[11rem_minmax(0,1fr)]'
  }
}

export function DescriptionList({
  items,
  labelWidth = 'default',
  className,
}: {
  items: readonly DescriptionItem[]
  labelWidth?: LabelWidth
  className?: string
}) {
  const shown = items.filter((item) => item.value !== null && item.value !== undefined)
  return (
    <dl
      data-slot="description-list"
      data-label-width={labelWidth}
      className={cn('grid gap-y-3 sm:gap-x-6', columns(labelWidth), className)}
    >
      {shown.map((item) => (
        <div key={item.label} className="grid gap-0.5 sm:col-span-2 sm:grid-cols-subgrid">
          <dt className="text-sm font-semibold text-muted-foreground sm:pt-px">{item.label}</dt>
          <dd className="m-0 min-w-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
