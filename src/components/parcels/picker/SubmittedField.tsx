import type { RefObject } from 'react'

interface SubmittedFieldProps {
  fieldRef: RefObject<HTMLInputElement | null>
  name: string
  initialValue: string
}

export function SubmittedField({ fieldRef, name, initialValue }: SubmittedFieldProps) {
  return (
    <input
      ref={fieldRef}
      type="text"
      name={name}
      defaultValue={initialValue}
      readOnly
      hidden
      tabIndex={-1}
      aria-hidden="true"
    />
  )
}
