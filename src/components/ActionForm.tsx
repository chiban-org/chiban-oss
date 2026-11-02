'use client'

import { type FormEvent, type ReactNode, useState } from 'react'
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

const TEXT_NODE = 3

function labelOf(element: Element): string {
  const label = (element as HTMLInputElement).labels?.[0]
  if (label === undefined) return element.getAttribute('name') ?? 'a required field'
  return Array.from(label.childNodes)
    .filter((n) => n.nodeType === TEXT_NODE)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
}

function missingFields(form: HTMLFormElement): string[] {
  return Array.from(form.elements)
    .filter(
      (el) =>
        el instanceof HTMLElement && 'validity' in el && !(el as HTMLInputElement).validity.valid,
    )
    .map(labelOf)
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
  const [missing, setMissing] = useState<string[]>([])
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const empty = missingFields(event.currentTarget)
    setMissing(empty)
    if (empty.length > 0) {
      event.preventDefault()
      return
    }
    formProps.onSubmit(event)
  }
  const message =
    missing.length > 0
      ? `Fill in: ${missing.join(', ')}.`
      : result === null
        ? null
        : result.ok
          ? result.message
          : result.error
  return (
    <form {...formProps} onSubmit={onSubmit} noValidate className={className}>
      <CsrfField />
      {children}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending || !hydrated}>
          {pending ? 'Working' : submitLabel}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  )
}
