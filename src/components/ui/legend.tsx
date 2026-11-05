import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Legend({
  bordered = false,
  className,
  ...props
}: ComponentProps<'legend'> & { bordered?: boolean }) {
  return (
    <legend
      data-slot="legend"
      className={cn('text-base font-semibold text-ink', bordered ? 'px-1' : 'mb-3 p-0', className)}
      {...props}
    />
  )
}
