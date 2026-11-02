import { CircleCheck, CircleX, Clock, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import type { Status } from '@/features/design/tokens'
import { cn } from '@/lib/utils'

interface StatusChipProps {
  status: Status
  label: string
}

const ICONS: Record<Status, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  passed: CircleCheck,
  failed: CircleX,
  overdue: Clock,
  neutral: Minus,
}

const CLASSES: Record<Status, string> = {
  passed: 'bg-status-passed-bg text-status-passed-fg',
  failed: 'bg-status-failed-bg text-status-failed-fg',
  overdue: 'bg-status-overdue-bg text-status-overdue-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
}

export function StatusChip({ status, label }: StatusChipProps) {
  const Icon = ICONS[status]
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold',
        CLASSES[status],
      )}
    >
      <Icon className="size-4" aria-hidden={true} />
      {label}
    </span>
  )
}
