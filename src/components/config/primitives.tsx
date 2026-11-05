'use client'

import type { ComponentProps, ReactNode } from 'react'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { Legend } from '@/components/ui/legend'

export type FieldErrors = Record<string, string>

export function rowKey(prefix: string, index: number): string {
  return prefix + String(index)
}

export function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const message = errors[name]
  if (message === undefined) return null
  return (
    <p
      id={`error-${name}`}
      role="alert"
      data-field-error={name}
      className="mt-1 text-sm text-status-failed-fg"
    >
      {message}
    </p>
  )
}

export function FieldGroup({
  name,
  label,
  errors,
  children,
}: {
  name: string
  label: string
  errors: FieldErrors
  children: ReactNode
}) {
  return (
    <fieldset
      data-field={name}
      aria-describedby={errors[name] === undefined ? undefined : `error-${name}`}
      className="my-4 rounded-md border p-3"
    >
      <Legend bordered>{label}</Legend>
      {children}
      <FieldError errors={errors} name={name} />
    </fieldset>
  )
}

export const Input = TextField
export const Area = AreaField
export const Pick = SelectField

type CheckProps = Omit<ComponentProps<typeof CheckField>, 'onChange' | 'onCheckedChange'> & {
  onChange?: (checked: boolean) => void
}

export function Check({ onChange, ...props }: CheckProps) {
  return (
    <CheckField
      {...props}
      {...(onChange === undefined
        ? {}
        : { onCheckedChange: (next: boolean | 'indeterminate') => onChange(next === true) })}
    />
  )
}

export function RowButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {children}
    </Button>
  )
}
