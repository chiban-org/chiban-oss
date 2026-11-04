import type * as React from 'react'
import { cn } from '@/lib/utils'

export const KBD_CLASS =
  'inline-flex min-w-5 items-center justify-center rounded border border-hairline bg-surface px-1.5 py-0.5 font-mono text-xs text-ink'

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd" className={cn(KBD_CLASS, className)} {...props} />
}
