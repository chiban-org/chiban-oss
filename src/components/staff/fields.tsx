import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const CONTROL = 'mt-1 block w-full rounded-md border bg-surface px-3 py-2 text-sm'

interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint === undefined ? null : (
        <span className="mt-1 block text-sm font-normal text-muted-foreground">{hint}</span>
      )}
    </label>
  )
}

export function TextField({
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  return (
    <Field label={label} {...(hint === undefined ? {} : { hint })}>
      <input {...props} className={cn(CONTROL, props.className)} />
    </Field>
  )
}

export function AreaField({
  label,
  hint,
  ...props
}: ComponentProps<'textarea'> & { label: string; hint?: string }) {
  return (
    <Field label={label} {...(hint === undefined ? {} : { hint })}>
      <textarea {...props} className={cn(CONTROL, props.className)} />
    </Field>
  )
}

export function SelectField({
  label,
  options,
  ...props
}: ComponentProps<'select'> & { label: string; options: readonly (readonly [string, string])[] }) {
  return (
    <Field label={label}>
      <select {...props} className={cn(CONTROL, props.className)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  )
}
