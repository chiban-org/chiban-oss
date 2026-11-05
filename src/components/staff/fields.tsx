import { type ComponentProps, type ReactNode, useId } from 'react'
import { Checkbox, CheckLine } from '@/components/ui/checkbox'
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
  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      action={action}
      required={props.required}
    >
      {props.type === 'file' ? (
        <FilePicker id={controlId} aria-describedby={hintId} {...omitType(props)} />
      ) : (
        <Input id={controlId} aria-describedby={hintId} {...props} />
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
  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      action={action}
      required={props.required}
    >
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
  action,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> &
  ActionProps & {
    label: string
    hint?: string
    options: readonly (readonly [string, string])[]
  }) {
  const { controlId, hintId } = useFieldIds(id, hint)
  return (
    <Field
      label={label}
      htmlFor={controlId}
      hint={hint}
      hintId={hintId}
      action={action}
      required={props.required}
    >
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
    <div
      data-slot="check-field"
      className={cn('flex items-start gap-2 text-sm leading-snug', className)}
    >
      <CheckLine>
        <Checkbox id={controlId} {...props} />
      </CheckLine>
      <Label htmlFor={controlId} className="leading-snug font-normal">
        <span>
          {label}
          {props.required === true ? <RequiredMark /> : null}
        </span>
      </Label>
    </div>
  )
}
