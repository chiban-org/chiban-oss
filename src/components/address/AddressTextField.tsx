'use client'

import { type ComponentProps, useEffect, useRef } from 'react'
import { AddressHint } from '@/components/address/AddressHint'
import { useAddressCheck } from '@/components/address/useAddressCheck'
import { useControlAria } from '@/components/fieldErrors'
import { Field, useFieldIds } from '@/components/staff/fields'
import { Input } from '@/components/ui/input'
import { toSingleLine } from '@/features/address/suggestionLayout'

export function AddressTextField({
  label,
  hint,
  id,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  const { error, aria } = useControlAria(props.name, hintId)
  const ref = useRef<HTMLInputElement>(null)
  const { suggestion, edited, left, reset } = useAddressCheck()

  useEffect(() => {
    const form = ref.current?.form
    if (form === null || form === undefined) return
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [reset])

  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      required={props.required}
      error={error}
    >
      <Input
        ref={ref}
        id={controlId}
        {...aria}
        {...props}
        onInput={(event) => {
          props.onInput?.(event)
          edited([event.currentTarget.value])
        }}
        onBlur={(event) => {
          props.onBlur?.(event)
          left([event.currentTarget.value])
        }}
      />
      <AddressHint
        suggestion={suggestion}
        onUse={(chosen) => {
          const input = ref.current
          if (input === null) return
          input.value = toSingleLine(chosen.lines)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }}
      />
    </Field>
  )
}
