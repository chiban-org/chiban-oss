'use client'

import { useEffect, useRef } from 'react'
import { SelectField } from '@/components/staff/fields'
import { useUploadPair } from './UploadPair'

const HINT = 'Upload it above if it is not listed. It is chosen here once uploaded.'

export function UploadedChoiceSelect({
  label,
  name,
  options,
}: {
  label: string
  name: string
  options: readonly (readonly [string, string])[]
}) {
  const box = useRef<HTMLDivElement>(null)
  const uploadedId = useUploadPair()?.uploadedId ?? null
  const listed = uploadedId !== null && options.some(([id]) => id === uploadedId)
  useEffect(() => {
    const select = box.current?.querySelector('select')
    if (listed && select != null) {
      select.value = uploadedId
    }
  }, [listed, uploadedId])
  return (
    <div ref={box}>
      <SelectField label={label} name={name} options={options} hint={HINT} />
    </div>
  )
}
