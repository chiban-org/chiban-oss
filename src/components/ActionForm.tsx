'use client'

import type { ReactNode } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { useFormAction } from '@/components/useFormAction'
import { useHydrated } from '@/components/useHydrated'
import type { ActionResult } from '@/server/actionRunner'

interface ActionFormProps {
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  variant?: 'default' | 'outline'
  className?: string
  children: ReactNode
}

function isFailure(result: ActionResult | null): boolean {
  return result !== null && !result.ok
}

export function ActionForm({
  action,
  submitLabel,
  variant = 'outline',
  className,
  children,
}: ActionFormProps) {
  const {
    state: result,
    pending,
    formProps,
  } = useFormAction<ActionResult | null>(
    async (_previous, formData) => await action(formData),
    null,
    isFailure,
  )
  const hydrated = useHydrated()
  return (
    <form {...formProps} className={className}>
      <CsrfField />
      {children}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending || !hydrated}>
          {pending ? 'Working' : submitLabel}
        </Button>
        <p role="status" className="text-sm">
          {result === null ? null : result.ok ? result.message : result.error}
        </p>
      </div>
    </form>
  )
}
