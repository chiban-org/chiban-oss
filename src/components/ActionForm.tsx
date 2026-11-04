'use client'

import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { Button } from '@/components/ui/button'
import { type ConfirmStep, useConfirmStep } from '@/components/useConfirmStep'
import { useFormAction } from '@/components/useFormAction'
import { useHydrated } from '@/components/useHydrated'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/server/actionRunner'

interface AlternateSubmit {
  label: string
  name: string
  value: string
}

interface ActionFormProps {
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  alternate?: AlternateSubmit
  variant?: 'default' | 'outline' | 'destructive'
  className?: string
  compact?: boolean
  checkBeforeSubmit?: (form: HTMLFormElement) => string | null
  confirm?: ConfirmStep
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

function markInvalid(form: HTMLFormElement, invalid: Element[], messageId: string): void {
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) {
    el.removeAttribute('aria-invalid')
    el.removeAttribute('aria-describedby')
  }
  for (const el of invalid) {
    el.setAttribute('aria-invalid', 'true')
    el.setAttribute('aria-describedby', messageId)
  }
  const first = invalid[0]
  if (first instanceof HTMLElement) first.focus()
}

function clearInvalid(form: HTMLFormElement | null): void {
  if (form === null) return
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) {
    el.removeAttribute('aria-invalid')
    el.removeAttribute('aria-describedby')
  }
}

function SubmitButtons({
  label,
  variant,
  alternate,
  disabled,
  pending,
}: {
  label: string
  variant: NonNullable<ActionFormProps['variant']>
  alternate: AlternateSubmit | undefined
  disabled: boolean
  pending: boolean
}) {
  return (
    <>
      <Button type="submit" variant={variant} disabled={disabled}>
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

export function ActionForm({
  action,
  submitLabel,
  alternate,
  variant = 'outline',
  className,
  compact = false,
  checkBeforeSubmit,
  confirm,
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
  const step = useConfirmStep(confirm)
  const messageId = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const form = formProps.ref
  const onInput = () => {
    setProblem(null)
    setEdited(true)
    clearInvalid(form.current)
  }
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
    const invalid = invalidFields(event.currentTarget)
    markInvalid(event.currentTarget, invalid, messageId)
    const found = problemMessage(invalid) ?? checkBeforeSubmit?.(event.currentTarget) ?? null
    setProblem(found)
    setEdited(false)
    if (found !== null) {
      event.preventDefault()
      return
    }
    if (step.intercept(event)) return
    formProps.onSubmit(event)
  }
  const answer = result === null || edited ? null : result.ok ? result.message : result.error
  const message = problem ?? answer
  const failed = problem !== null || (answer !== null && result?.ok === false)
  return (
    <>
      <form
        {...formProps}
        onSubmit={onSubmit}
        onInput={onInput}
        noValidate
        className={cn(compact ? undefined : 'flex flex-col gap-4', className)}
      >
        <CsrfField />
        {children}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SubmitButtons
            label={submitLabel}
            variant={variant}
            alternate={alternate}
            disabled={pending || !hydrated}
            pending={pending}
          />
          <p
            id={messageId}
            role="status"
            data-tone={failed ? 'failed' : undefined}
            className="text-sm data-[tone=failed]:font-semibold data-[tone=failed]:text-status-failed-fg"
          >
            {message}
          </p>
        </div>
      </form>
      {confirm === undefined ? null : (
        <ConfirmDialog
          open={step.open}
          copy={confirm}
          onConfirm={step.accept}
          onCancel={step.dismiss}
          returnFocusTo={step.returnFocusTo}
        />
      )}
    </>
  )
}
