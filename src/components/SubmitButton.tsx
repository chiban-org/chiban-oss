'use client'

import type { ComponentProps, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/components/useHydrated'

interface SubmitButtonProps {
  children: ReactNode
  className?: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
}

export function SubmitButton({ children, className, variant, size }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  const hydrated = useHydrated()
  return (
    <Button
      type="submit"
      disabled={pending || !hydrated}
      className={className}
      variant={variant}
      size={size}
    >
      {children}
    </Button>
  )
}
