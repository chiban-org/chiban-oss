'use client'

import { type FormEvent, useRef, useState } from 'react'
import type { ConfirmCopy } from '@/components/ConfirmDialog'

export interface ConfirmStep extends ConfirmCopy {
  when?: { name: string; oneOf: string[] }
}

interface Held {
  form: HTMLFormElement
  submitter: HTMLElement | null
}

function applies(step: ConfirmStep, form: HTMLFormElement): boolean {
  if (step.when === undefined) return true
  const { name, oneOf } = step.when
  const values = new FormData(form).getAll(name)
  const chosen = values.length === 0 ? [''] : values
  return chosen.some((value) => typeof value === 'string' && oneOf.includes(value))
}

export type ConfirmCheck = (
  form: HTMLFormElement,
  submitter: HTMLElement | null,
) => Promise<boolean>

export function useConfirmStep(step: ConfirmStep | undefined, check?: ConfirmCheck) {
  const [open, setOpen] = useState(false)
  const confirmed = useRef(false)
  const held = useRef<Held | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const openAfterCheck = async (waiting: Held) => {
    const passes = check === undefined || (await check(waiting.form, waiting.submitter))
    if (held.current !== waiting) return
    if (passes) setOpen(true)
    else held.current = null
  }
  const intercept = (event: FormEvent<HTMLFormElement>): boolean => {
    if (confirmed.current) return false
    if (step === undefined || !applies(step, event.currentTarget)) return false
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter ?? null
    const waiting = { form: event.currentTarget, submitter }
    held.current = waiting
    trigger.current = submitter
    void openAfterCheck(waiting)
    return true
  }
  const accept = () => {
    setOpen(false)
    const waiting = held.current
    held.current = null
    if (waiting === null) return
    confirmed.current = true
    waiting.form.requestSubmit(waiting.submitter)
    confirmed.current = false
  }
  const dismiss = () => {
    setOpen(false)
    held.current = null
  }
  const returnFocusTo = () => trigger.current
  return { open, intercept, accept, dismiss, returnFocusTo }
}
