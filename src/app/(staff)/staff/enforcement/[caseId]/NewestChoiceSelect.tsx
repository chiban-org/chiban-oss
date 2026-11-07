'use client'

import { useState } from 'react'
import { SelectField } from '@/components/staff/fields'
import { useUploadPair } from './UploadPair'

const HINT = 'Upload it above if it is not listed. It is chosen here once uploaded.'

export function NewestChoiceSelect({
  label,
  name,
  options,
  hint,
}: {
  label: string
  name: string
  options: readonly (readonly [string, string])[]
  hint?: string
}) {
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set(options.map(([id]) => id)))
  const [value, setValue] = useState(options[0]?.[0] ?? '')
  const armed = useUploadPair()?.armed ?? 0
  const [handled, setHandled] = useState(armed)
  const fresh = options.find(([id]) => !known.has(id))
  if (fresh !== undefined) {
    setKnown(new Set(options.map(([id]) => id)))
    if (armed > handled) {
      setHandled(armed)
      setValue(fresh[0])
    }
  }
  return (
    <SelectField
      label={label}
      name={name}
      options={options}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      hint={hint ?? HINT}
    />
  )
}
