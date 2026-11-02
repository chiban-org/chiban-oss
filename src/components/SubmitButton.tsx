'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useHydrated } from '@/components/useHydrated'

interface SubmitButtonProps {
  children: ReactNode
  className?: string
}

export function SubmitButton({ children, className }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  const hydrated = useHydrated()
  return (
    <button type="submit" disabled={pending || !hydrated} className={className}>
      {children}
    </button>
  )
}
