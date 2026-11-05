'use client'

import { AddressQuestion } from '@/components/forms/AddressQuestion'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { isAddressQuestion } from '@/features/address/addressQuestion'
import { evaluateCondition } from '@/features/forms/condition'
import type { FormBody, FormField } from '@/features/forms/formSchema'

export type FormValue = string | number | boolean | string[]

export interface FormRendererProps {
  form: FormBody
  values: Record<string, unknown>
  errors: Record<string, string>
  onChange: (key: string, value: FormValue) => void
  addressChecks?: boolean
}

const INPUT_TYPES: Partial<Record<FormField['type'], string>> = {
  text: 'text',
  email: 'email',
  phone: 'tel',
  date: 'date',
  integer: 'number',
  decimal: 'text',
  money: 'text',
}
const INPUT_MODES: Partial<Record<FormField['type'], 'numeric' | 'decimal'>> = {
  integer: 'numeric',
  decimal: 'decimal',
  money: 'decimal',
}
const TARGET = 'min-h-11'

function isRequired(field: FormField, values: Record<string, unknown>): boolean {
  return (
    field.required || (field.requireIf !== undefined && evaluateCondition(field.requireIf, values))
  )
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

interface ControlProps {
  field: FormField
  id: string
  value: unknown
  invalid: boolean
  describedBy: string | undefined
  required: boolean
  onChange: FormRendererProps['onChange']
}

function MultiSelect({ field, id, value, onChange }: ControlProps) {
  const chosen: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
  return (
    <fieldset id={id} className="space-y-2">
      {(field.options ?? []).map((option) => {
        const optionId = `${id}-${option.value}`
        return (
          <div key={option.value} className={`flex items-center gap-3 ${TARGET}`}>
            <Checkbox
              id={optionId}
              checked={chosen.includes(option.value)}
              onCheckedChange={(next) =>
                onChange(
                  field.key,
                  next === true
                    ? [...chosen, option.value]
                    : chosen.filter((v) => v !== option.value),
                )
              }
            />
            <Label htmlFor={optionId} className="text-base">
              {option.label}
            </Label>
          </div>
        )
      })}
    </fieldset>
  )
}

function SingleSelect({ field, id, value, invalid, describedBy, onChange }: ControlProps) {
  return (
    <Select value={asText(value)} onValueChange={(next) => onChange(field.key, next)}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${TARGET} w-full text-base`}
      >
        <SelectValue placeholder="Choose one" />
      </SelectTrigger>
      <SelectContent>
        {(field.options ?? []).map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-base">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Control(props: ControlProps) {
  const { field, id, value, invalid, describedBy, required, onChange } = props
  if (field.type === 'select') return <SingleSelect {...props} />
  if (field.type === 'multiselect') return <MultiSelect {...props} />
  if (field.type === 'checkbox') {
    return (
      <div className={`flex items-center gap-3 ${TARGET}`}>
        <Checkbox
          id={id}
          checked={value === true}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onCheckedChange={(next) => onChange(field.key, next === true)}
        />
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <Textarea
        id={id}
        value={asText(value)}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="min-h-28 text-base"
        onChange={(event) => onChange(field.key, event.target.value)}
      />
    )
  }
  return (
    <Input
      id={id}
      type={INPUT_TYPES[field.type] ?? 'text'}
      inputMode={INPUT_MODES[field.type]}
      value={asText(value)}
      required={required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={`${TARGET} text-base`}
      onChange={(event) => onChange(field.key, event.target.value)}
    />
  )
}

interface EntryProps {
  field: FormField
  values: Record<string, unknown>
  error: string | undefined
  onChange: FormRendererProps['onChange']
  addressChecks?: boolean | undefined
}

function FieldRow({ field, values, error, onChange, addressChecks }: EntryProps) {
  const id = `field-${field.key}`
  const errorId = `${id}-error`
  const helpId = `${id}-help`
  const describedBy =
    [error === undefined ? null : errorId, field.help === undefined ? null : helpId]
      .filter((v): v is string => v !== null)
      .join(' ') || undefined
  const required = isRequired(field, values)
  const control = (
    <Control
      field={field}
      id={id}
      value={values[field.key]}
      invalid={error !== undefined}
      describedBy={describedBy}
      required={required}
      onChange={onChange}
    />
  )
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-base font-medium">
        <span>
          {field.label}
          {required ? <RequiredMark /> : null}
        </span>
      </Label>
      {field.help === undefined ? null : (
        <p id={helpId} className="m-0 text-base text-muted-foreground">
          {field.help}
        </p>
      )}
      {addressChecks === true && isAddressQuestion(field) ? (
        <AddressQuestion field={field} text={asText(values[field.key])} onChange={onChange}>
          {control}
        </AddressQuestion>
      ) : (
        control
      )}
      {error === undefined ? null : (
        <p id={errorId} className="m-0 text-base font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function SectionHeading({ field }: { field: FormField }) {
  return (
    <div className="space-y-1 border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <h3 className="m-0 text-lg font-bold">{field.label}</h3>
      {field.help === undefined ? null : (
        <p className="m-0 text-base text-muted-foreground">{field.help}</p>
      )}
    </div>
  )
}

export function FormEntry(props: EntryProps) {
  if (props.field.type === 'section') return <SectionHeading field={props.field} />
  return <FieldRow {...props} />
}

export function FormRenderer({ form, values, errors, onChange, addressChecks }: FormRendererProps) {
  return (
    <div className="flex flex-col gap-5">
      {form.fields
        .filter((f) => f.staffOnly !== true)
        .filter((f) => f.showIf === undefined || evaluateCondition(f.showIf, values))
        .map((field) => (
          <FormEntry
            key={field.key}
            field={field}
            values={values}
            error={errors[field.key]}
            onChange={onChange}
            addressChecks={addressChecks}
          />
        ))}
    </div>
  )
}
