import { useLayoutEffect, useRef } from 'react'
import { useFormReset } from './useFormReset'

export function useSubmittedValue(value: string, onSaved: () => void) {
  const fieldRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (fieldRef.current !== null) fieldRef.current.value = value
  }, [value])
  useFormReset(fieldRef, () => {
    const sent = value
    setTimeout(() => {
      if (fieldRef.current !== null && fieldRef.current.value !== sent) onSaved()
    }, 0)
  })
  return fieldRef
}
