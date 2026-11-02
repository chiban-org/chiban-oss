'use client'

import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type FieldErrors = Record<string, string>

export function rowKey(prefix: string, index: number): string {
  return prefix + String(index)
}

const CONTROL = 'mt-1 block w-full rounded-md border bg-surface px-2 py-1.5 text-sm'

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

export function Input({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input {...props} className={cn(CONTROL, props.className)} />
    </label>
  )
}

export function Area({ label, ...props }: ComponentProps<'textarea'> & { label: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea {...props} className={cn(CONTROL, props.className)} />
    </label>
  )
}

export function Pick({
  label,
  options,
  ...props
}: ComponentProps<'select'> & { label: string; options: readonly (readonly [string, string])[] }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select {...props} className={cn(CONTROL, props.className)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Check({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" {...props} />
      {label}
    </label>
  )
}

export function RowButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {children}
    </Button>
  )
}
