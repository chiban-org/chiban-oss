'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FormField } from '@/features/forms/formSchema'

export type FormValue = string | number | boolean | string[]

export const TARGET = 'min-h-11'

export interface ControlProps {
  field: FormField
  id: string
  value: unknown
  invalid: boolean
  describedBy: string | undefined
  required: boolean
  onChange: (key: string, value: FormValue) => void
}

export function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

export function MultiSelect({ field, id, value, onChange }: ControlProps) {
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

export function SingleSelect({ field, id, value, invalid, describedBy, onChange }: ControlProps) {
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

function yesNoValue(value: unknown): string {
  if (value === true) return 'yes'
  return value === false ? 'no' : ''
}

export function YesNo({ field, id, value, invalid, describedBy, onChange }: ControlProps) {
  return (
    <RadioGroup
      id={id}
      aria-labelledby={`${id}-label`}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={yesNoValue(value)}
      onValueChange={(next) => onChange(field.key, next === 'yes')}
      className="flex flex-wrap gap-x-8 gap-y-1"
    >
      {(['yes', 'no'] as const).map((choice) => (
        <div key={choice} className={`flex items-center gap-3 ${TARGET}`}>
          <RadioGroupItem id={`${id}-${choice}`} value={choice} />
          <Label htmlFor={`${id}-${choice}`} className="text-base">
            {choice === 'yes' ? 'Yes' : 'No'}
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}
