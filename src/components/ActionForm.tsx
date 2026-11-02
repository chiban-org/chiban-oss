'use client'

import { type ReactNode, useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/server/actionRunner'

interface ActionFormProps {
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  variant?: 'default' | 'outline'
  className?: string
  children: ReactNode
}

export function ActionForm({
  action,
  submitLabel,
  variant = 'outline',
  className,
  children,
}: ActionFormProps) {
  const [result, run, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => await action(formData),
    null,
  )
  return (
    <form action={run} className={className}>
      <CsrfField />
      {children}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? 'Working' : submitLabel}
        </Button>
        <p role="status" className="text-sm">
          {result === null ? null : result.ok ? result.message : result.error}
        </p>
      </div>
    </form>
  )
}
