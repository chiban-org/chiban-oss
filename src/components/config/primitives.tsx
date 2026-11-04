'use client'

import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'

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
      <legend className="px-1 text-sm font-medium">{label}</legend>
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
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {children}
    </Button>
  )
}

export function ListInput({
  label,
  values,
  onValues,
  separator,
  multiline,
}: {
  label: string
  values: string[]
  onValues: (next: string[]) => void
  separator: RegExp
  multiline?: boolean
}) {
  const joined = values.join(multiline === true ? '\n' : ', ')
  const [raw, setRaw] = useState(joined)
  useEffect(() => {
    if (parseWith(raw, separator).join('|') !== values.join('|')) setRaw(joined)
  }, [joined, raw, separator, values])
  const change = (text: string) => {
    setRaw(text)
    onValues(parseWith(text, separator))
  }
  return multiline === true ? (
    <Area label={label} rows={4} value={raw} onChange={(e) => change(e.target.value)} />
  ) : (
    <Input label={label} value={raw} onChange={(e) => change(e.target.value)} />
  )
}

function parseWith(text: string, separator: RegExp): string[] {
  return text
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}
