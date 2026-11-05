'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Field } from '@/components/staff/fields'
import { Label } from '@/components/ui/label'
import { ChosenParcel } from './ChosenParcel'
import { ParcelCombobox } from './ParcelCombobox'
import {
  choiceValue,
  type ParcelSearch,
  type PickerChoice,
  type PickerFieldProps,
} from './pickerChoice'
import { SubmittedField } from './SubmittedField'
import { useSubmittedValue } from './useSubmittedValue'

export interface ParcelPickerProps extends PickerFieldProps {
  labelHidden?: boolean
  initial?: PickerChoice | null
  className?: string | undefined
}

export function ParcelPickerView({
  name,
  label,
  hint,
  labelHidden = false,
  required = false,
  allowUnknown = false,
  initial = null,
  className,
  search,
}: ParcelPickerProps & { search: ParcelSearch }) {
  const id = useId()
  const hintId = hint === undefined ? undefined : `${id}-hint`
  const inputRef = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<PickerChoice | null>(initial)
  const refocus = useRef(false)
  const fieldRef = useSubmittedValue(chosen === null ? '' : choiceValue(chosen), () =>
    setChosen(initial),
  )
  useEffect(() => {
    if (refocus.current && chosen === null) inputRef.current?.focus()
    refocus.current = false
  }, [chosen])
  const body = (
    <>
      <SubmittedField
        fieldRef={fieldRef}
        name={name}
        initialValue={initial === null ? '' : choiceValue(initial)}
      />
      {chosen === null ? (
        <ParcelCombobox
          id={id}
          inputRef={inputRef}
          search={search}
          allowUnknown={allowUnknown}
          required={required}
          describedBy={hintId}
          className={className}
          onPick={setChosen}
        />
      ) : (
        <ChosenParcel
          choice={chosen}
          actionLabel="Change"
          actionAriaLabel="Change parcel"
          onAction={() => {
            refocus.current = true
            setChosen(null)
          }}
        />
      )}
    </>
  )
  if (!labelHidden)
    return (
      <Field label={label} htmlFor={id} hint={hint} hintId={hintId} required={required}>
        {body}
      </Field>
    )
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      {body}
    </div>
  )
}
