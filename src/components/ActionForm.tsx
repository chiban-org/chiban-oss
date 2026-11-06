'use client'

import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { type AlternateSubmit, SubmitButtons } from '@/components/ActionFormButtons'
import {
  checkOnlyData,
  checkPasses,
  formDisplay,
  sendOrExplain,
} from '@/components/actionFormCheck'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CsrfField } from '@/components/CsrfField'
import { useCloseEnclosingDialog } from '@/components/dialogCloseContext'
import { FieldErrorsProvider } from '@/components/fieldErrors'
import {
  clearInvalid,
  focusFirstNamed,
  invalidFields,
  markInvalid,
  problemMessage,
} from '@/components/formValidity'
import { RequiredNote } from '@/components/ui/required-mark'
import { type ConfirmStep, useConfirmStep } from '@/components/useConfirmStep'
import { isRestoringValues, useFormAction } from '@/components/useFormAction'
import { useHydrated } from '@/components/useHydrated'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/server/actionRunner'

interface ActionFormProps {
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  submitAccessibleLabel?: string
  alternate?: AlternateSubmit
  variant?: 'default' | 'outline' | 'destructive'
  className?: string
  compact?: boolean
  checkBeforeSubmit?: (form: HTMLFormElement) => string | null
  confirm?: ConfirmStep
  closeOnSuccess?: boolean
  children: ReactNode
}

function isFailure(result: ActionResult | null): boolean {
  return result !== null && !result.ok
}

export function ActionForm({
  action,
  submitLabel,
  submitAccessibleLabel,
  alternate,
  variant = 'outline',
  className,
  compact = false,
  checkBeforeSubmit,
  confirm,
  closeOnSuccess = false,
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
  const closeDialog = useCloseEnclosingDialog()
  const [checking, setChecking] = useState(false)
  const [checkReply, setCheckReply] = useState<ActionResult | null>(null)
  const step = useConfirmStep(confirm, async (form, submitter) => {
    setChecking(true)
    const reply = await sendOrExplain(action, checkOnlyData(form, submitter))
    setChecking(false)
    const passes = checkPasses(reply)
    setCheckReply(passes ? null : reply)
    return passes
  })
  const messageId = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const form = formProps.ref
  const onInput = () => {
    if (isRestoringValues()) return
    setProblem(null)
    setEdited(true)
    setCheckReply(null)
    clearInvalid(form.current)
  }
  useEffect(() => {
    const onOtherSubmit = (event: Event) => {
      if (event.target === form.current) return
      setProblem(null)
      setEdited(true)
      setCheckReply(null)
    }
    document.addEventListener('submit', onOtherSubmit, true)
    return () => document.removeEventListener('submit', onOtherSubmit, true)
  }, [form])
  useEffect(() => {
    if (closeOnSuccess && result?.ok === true) closeDialog?.()
  }, [closeOnSuccess, result, closeDialog])
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const invalid = invalidFields(event.currentTarget)
    markInvalid(event.currentTarget, invalid, messageId)
    const found = problemMessage(invalid) ?? checkBeforeSubmit?.(event.currentTarget) ?? null
    setProblem(found)
    setEdited(false)
    setCheckReply(null)
    if (found !== null) {
      event.preventDefault()
      return
    }
    if (step.intercept(event)) return
    formProps.onSubmit(event)
  }
  const busy = pending || checking
  const { message, failed, fieldErrors } = formDisplay(
    problem,
    checkReply ?? (busy || edited ? null : result),
  )
  useEffect(() => {
    focusFirstNamed(form.current, Object.keys(fieldErrors))
  }, [form, fieldErrors])
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
        {compact ? null : <RequiredNote />}
        <FieldErrorsProvider errors={fieldErrors}>{children}</FieldErrorsProvider>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SubmitButtons
            label={submitLabel}
            accessibleLabel={submitAccessibleLabel}
            variant={variant}
            alternate={alternate}
            disabled={busy || !hydrated}
            pending={busy}
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
