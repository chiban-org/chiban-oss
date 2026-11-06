'use client'

import { type ComponentProps, type ReactNode, useId } from 'react'
import { FieldErrorMessage, type FieldErrorView, useControlAria } from '@/components/fieldErrors'
import { FilePicker } from '@/components/ui/file-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { RequiredMark } from '@/components/ui/required-mark'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: ReactNode
  htmlFor: string
  hint?: string | undefined
  hintId?: string | undefined
  className?: string | undefined
  action?: ReactNode
  required?: boolean | undefined
  error?: FieldErrorView | null
  children: ReactNode
}

export function Field({
  label,
  htmlFor,
  hint,
  hintId,
  className,
  action,
  required,
  error,
  children,
}: FieldProps) {
  return (
    <div data-slot="field" className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={htmlFor}>
        <span>
          {label}
          {required === true ? <RequiredMark /> : null}
        </span>
      </Label>
      {action === undefined ? (
        children
      ) : (
        <ControlWithAction action={action}>{children}</ControlWithAction>
      )}
      {hint === undefined ? null : (
        <p id={hintId} className="m-0 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldErrorMessage error={error} />
    </div>
  )
}

export function ControlWithAction({
  action,
  children,
}: {
  action: ReactNode
  children: ReactNode
}) {
  return (
    <div data-slot="field-control-row" className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 max-w-xl flex-1 basis-48">{children}</div>
      {action}
    </div>
  )
}

export function useFieldIds(id: string | undefined, hint?: string) {
  const generated = useId()
  const controlId = id ?? generated
  const hintId = hint === undefined ? undefined : `${controlId}-hint`
  return { controlId, hintId }
}

interface ActionProps {
  action?: ReactNode
}

function omitType({ type: _type, ...rest }: ComponentProps<'input'>) {
  return rest
}

export function TextField({
  label,
  hint,
  id,
  action,
  ...props
}: ComponentProps<'input'> & ActionProps & { label: string; hint?: string }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  const { error, aria } = useControlAria(props.name, hintId)
  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      action={action}
      required={props.required}
      error={error}
    >
      {props.type === 'file' ? (
        <FilePicker id={controlId} {...aria} {...omitType(props)} />
      ) : (
        <Input id={controlId} {...aria} {...props} />
      )}
    </Field>
  )
}

export function AreaField({
  label,
  hint,
  id,
  action,
  ...props
}: ComponentProps<'textarea'> & ActionProps & { label: string; hint?: string }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  const { error, aria } = useControlAria(props.name, hintId)
  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      action={action}
      required={props.required}
      error={error}
    >
      <Textarea
        id={controlId}
        {...aria}
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
  action,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> &
  ActionProps & {
    label: string
    hint?: string
    options: readonly (readonly [string, string])[]
  }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  const { error, aria } = useControlAria(props.name, hintId)
  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      action={action}
      required={props.required}
      error={error}
    >
      <NativeSelect id={controlId} {...aria} {...props}>
        {options.map(([value, text]) => (
          <NativeSelectOption key={value} value={value}>
            {text}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

export { CheckField } from '@/components/staff/CheckField'
