'use client'

import { Button } from '@/components/ui/button'

export interface AlternateSubmit {
  label: string
  name: string
  value: string
}

export function SubmitButtons({
  label,
  accessibleLabel,
  variant,
  alternate,
  disabled,
  pending,
}: {
  label: string
  accessibleLabel: string | undefined
  variant: 'default' | 'outline' | 'destructive'
  alternate: AlternateSubmit | undefined
  disabled: boolean
  pending: boolean
}) {
  return (
    <>
      <Button type="submit" variant={variant} disabled={disabled} aria-label={accessibleLabel}>
        {pending ? 'Working' : label}
      </Button>
      {alternate === undefined ? null : (
        <Button
          type="submit"
          variant="outline"
          name={alternate.name}
          value={alternate.value}
          disabled={disabled}
        >
          {alternate.label}
        </Button>
      )}
    </>
  )
}
