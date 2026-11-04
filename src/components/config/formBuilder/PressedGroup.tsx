'use client'

import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PressedGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: readonly (readonly [T, string, LucideIcon])[]
  value: T
  onChange: (next: T) => void
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label={label}
    >
      {options.map(([option, text, Icon]) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? 'outline' : 'ghost'}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          <Icon aria-hidden="true" />
          {text}
        </Button>
      ))}
    </div>
  )
}
