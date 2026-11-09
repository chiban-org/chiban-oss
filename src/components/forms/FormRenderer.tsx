'use client'

import type { ReactNode } from 'react'
import { AddressQuestion } from '@/components/forms/AddressQuestion'
import {
  asText,
  type ControlProps,
  type FormValue,
  MultiSelect,
  SingleSelect,
  TARGET,
  YesNo,
} from '@/components/forms/choiceControls'
import { Checkbox, CheckLine } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Textarea } from '@/components/ui/textarea'
import { isAddressQuestion } from '@/features/address/addressQuestion'
import { evaluateCondition } from '@/features/forms/condition'
import type { FormBody, FormField } from '@/features/forms/formSchema'

export type { FormValue } from '@/components/forms/choiceControls'

export interface FormRendererProps {
  form: FormBody
  values: Record<string, unknown>
  errors: Record<string, string>
  onChange: (key: string, value: FormValue) => void
  addressChecks?: boolean
  includeStaffOnly?: boolean
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

function isRequired(field: FormField, values: Record<string, unknown>): boolean {
  return (
    field.required || (field.requireIf !== undefined && evaluateCondition(field.requireIf, values))
  )
}

function Confirm({ field, id, value, invalid, describedBy, onChange }: ControlProps) {
  return (
    <Checkbox
      id={id}
      checked={value === true}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onCheckedChange={(next) => onChange(field.key, next === true)}
    />
  )
}

function Control(props: ControlProps) {
  const { field, id, value, invalid, describedBy, required, onChange } = props
  if (field.type === 'select') return <SingleSelect {...props} />
  if (field.type === 'multiselect') return <MultiSelect {...props} />
  if (field.type === 'checkbox') return required ? <Confirm {...props} /> : <YesNo {...props} />
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

function FieldControl({
  field,
  values,
  onChange,
  addressChecks,
  children,
}: Omit<EntryProps, 'error'> & { children: ReactNode }) {
  if (addressChecks !== true || !isAddressQuestion(field)) return children
  return (
    <AddressQuestion field={field} text={asText(values[field.key])} onChange={onChange}>
      {children}
    </AddressQuestion>
  )
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
  const label = (
    <Label id={`${id}-label`} htmlFor={id} className="text-base font-medium">
      <span>
        {field.label}
        {required ? <RequiredMark /> : null}
      </span>
    </Label>
  )
  const confirming = field.type === 'checkbox' && required
  return (
    <div className="space-y-1.5">
      {confirming ? (
        <div className={`flex items-start gap-3 ${TARGET}`}>
          <CheckLine>{control}</CheckLine>
          {label}
        </div>
      ) : (
        label
      )}
      {field.help === undefined ? null : (
        <p id={helpId} className="text-base text-muted-foreground">
          {field.help}
        </p>
      )}
      {confirming ? null : (
        <FieldControl
          field={field}
          values={values}
          onChange={onChange}
          addressChecks={addressChecks}
        >
          {control}
        </FieldControl>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-base font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function SectionHeading({ field }: { field: FormField }) {
  return (
    <div className="space-y-1 border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-lg font-bold">{field.label}</h3>
      {field.help === undefined ? null : (
        <p className="text-base text-muted-foreground">{field.help}</p>
      )}
    </div>
  )
}

export function FormEntry(props: EntryProps) {
  if (props.field.type === 'section') return <SectionHeading field={props.field} />
  return <FieldRow {...props} />
}

export function FormRenderer({
  form,
  values,
  errors,
  onChange,
  addressChecks,
  includeStaffOnly = false,
}: FormRendererProps) {
  return (
    <div className="flex flex-col gap-5">
      {form.fields
        .filter((f) => includeStaffOnly || f.staffOnly !== true)
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
