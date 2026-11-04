'use client'

import { useId, useRef, useState } from 'react'
import { Field } from '@/components/staff/fields'
import { ChosenParcel } from './ChosenParcel'
import { ParcelCombobox } from './ParcelCombobox'
import {
  choiceTitle,
  choiceValue,
  type ParcelSearch,
  type PickerChoice,
  type PickerFieldProps,
} from './pickerChoice'
import { useFormReset } from './useFormReset'

export interface ParcelMultiPickerProps extends PickerFieldProps {
  initial?: PickerChoice[]
}

export function ParcelMultiPickerView({
  name,
  label,
  hint,
  required = false,
  allowUnknown = false,
  initial = [],
  search,
}: ParcelMultiPickerProps & { search: ParcelSearch }) {
  const id = useId()
  const hintId = hint === undefined ? undefined : `${id}-hint`
  const inputRef = useRef<HTMLInputElement>(null)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<PickerChoice[]>(initial)
  useFormReset(hiddenRef, () => setChosen(initial))
  const add = (choice: PickerChoice) => {
    const value = choiceValue(choice)
    setChosen((list) => (list.some((c) => choiceValue(c) === value) ? list : [...list, choice]))
  }
  const remove = (value: string) => {
    setChosen((list) => list.filter((c) => choiceValue(c) !== value))
    inputRef.current?.focus()
  }
  return (
    <Field label={label} htmlFor={id} hint={hint} hintId={hintId}>
      <input ref={hiddenRef} type="hidden" name={name} value={chosen.map(choiceValue).join(' ')} />
      {chosen.length === 0 ? null : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {chosen.map((choice) => (
            <li key={choiceValue(choice)}>
              <ChosenParcel
                choice={choice}
                actionLabel="Remove"
                actionAriaLabel={`Remove ${choiceTitle(choice)}`}
                onAction={() => remove(choiceValue(choice))}
              />
            </li>
          ))}
        </ul>
      )}
      <ParcelCombobox
        id={id}
        inputRef={inputRef}
        search={search}
        allowUnknown={allowUnknown}
        required={required && chosen.length === 0}
        describedBy={hintId}
        onPick={add}
      />
    </Field>
  )
}
