'use client'

import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
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
  checkBeforeSubmit?: (form: HTMLFormElement) => string | null
  children: ReactNode
}

const UNSENT_COPY =
  'The form could not be sent. Check your connection and any attached files, then try again.'

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

function invalidFields(form: HTMLFormElement): Element[] {
  return Array.from(form.elements).filter(
    (el) =>
      el instanceof HTMLElement && 'validity' in el && !(el as HTMLInputElement).validity.valid,
  )
}

function problemMessage(invalid: Element[]): string | null {
  if (invalid.length === 0) return null
  const empty = invalid.filter((el) => (el as HTMLInputElement).validity.valueMissing)
  const wrong = invalid.filter((el) => !(el as HTMLInputElement).validity.valueMissing)
  return [
    empty.length > 0 ? `Fill in: ${empty.map(labelOf).join(', ')}.` : '',
    wrong.length > 0 ? `Check: ${wrong.map(labelOf).join(', ')}.` : '',
  ]
    .filter((part) => part !== '')
    .join(' ')
}

async function sendOrExplain(
  action: (formData: FormData) => Promise<ActionResult>,
  formData: FormData,
): Promise<ActionResult> {
  try {
    return await action(formData)
  } catch {
    return { ok: false, error: UNSENT_COPY }
  }
}

function isFailure(result: ActionResult | null): boolean {
  return result !== null && !result.ok
}

export function ActionForm({
  action,
  submitLabel,
  variant = 'outline',
  className,
  checkBeforeSubmit,
  children,
}: ActionFormProps) {
  const {
    state: result,
    pending,
    formProps,
  } = useFormAction<ActionResult | null>(
    async (_previous, formData) => await sendOrExplain(action, formData),
    null,
    isFailure,
  )
  const hydrated = useHydrated()
  const [problem, setProblem] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const onInput = () => {
    setProblem(null)
    setEdited(true)
  }
  const form = formProps.ref
  useEffect(() => {
    const onOtherSubmit = (event: Event) => {
      if (event.target === form.current) return
      setProblem(null)
      setEdited(true)
    }
    document.addEventListener('submit', onOtherSubmit, true)
    return () => document.removeEventListener('submit', onOtherSubmit, true)
  }, [form])
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const found =
      problemMessage(invalidFields(event.currentTarget)) ??
      checkBeforeSubmit?.(event.currentTarget) ??
      null
    setProblem(found)
    setEdited(false)
    if (found !== null) {
      event.preventDefault()
      return
    }
    formProps.onSubmit(event)
  }
  const answer = result === null || edited ? null : result.ok ? result.message : result.error
  const message = problem ?? answer
  return (
    <form {...formProps} onSubmit={onSubmit} onInput={onInput} noValidate className={className}>
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
