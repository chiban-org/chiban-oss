import { type ComponentProps, type ReactNode, useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: ReactNode
  htmlFor: string
  hint?: string | undefined
  hintId?: string | undefined
  className?: string | undefined
  children: ReactNode
}

export function Field({ label, htmlFor, hint, hintId, className, children }: FieldProps) {
  return (
    <div data-slot="field" className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint === undefined ? null : (
        <p id={hintId} className="m-0 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

export function useFieldIds(id: string | undefined, hint?: string) {
  const generated = useId()
  const controlId = id ?? generated
  const hintId = hint === undefined ? undefined : `${controlId}-hint`
  return { controlId, hintId }
}

export function TextField({
  label,
  hint,
  id,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  return (
    <Field label={label} htmlFor={controlId} hint={hint} hintId={hintId}>
      <Input id={controlId} aria-describedby={hintId} {...props} />
    </Field>
  )
}

export function AreaField({
  label,
  hint,
  id,
  ...props
}: ComponentProps<'textarea'> & { label: string; hint?: string }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  return (
    <Field label={label} htmlFor={controlId} hint={hint} hintId={hintId}>
      <Textarea
        id={controlId}
        aria-describedby={hintId}
        {...props}
        className={cn('field-sizing-fixed', props.className)}
      />
    </Field>
  )
}

export function SelectField({
  label,
  hint,
  id,
  options,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & {
  label: string
  hint?: string
  options: readonly (readonly [string, string])[]
}) {
  const { controlId, hintId } = useFieldIds(id, hint)
  return (
    <Field label={label} htmlFor={controlId} hint={hint} hintId={hintId}>
      <NativeSelect id={controlId} aria-describedby={hintId} {...props}>
        {options.map(([value, text]) => (
          <NativeSelectOption key={value} value={value}>
            {text}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

export function CheckField({
  label,
  id,
  className,
  ...props
}: ComponentProps<typeof Checkbox> & { label: ReactNode }) {
  const generated = useId()
  const controlId = id ?? generated
  return (
    <div data-slot="check-field" className={cn('flex items-center gap-2', className)}>
      <Checkbox id={controlId} {...props} />
      <Label htmlFor={controlId} className="leading-snug font-normal">
        {label}
      </Label>
    </div>
  )
}
