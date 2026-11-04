import { type RefObject, useEffect, useRef } from 'react'

export function useFormReset(
  fieldRef: RefObject<HTMLInputElement | null>,
  onReset: () => void,
): void {
  const latest = useRef(onReset)
  useEffect(() => {
    latest.current = onReset
  })
  useEffect(() => {
    const form = fieldRef.current?.form ?? null
    if (form === null) return
    const listener = () => latest.current()
    form.addEventListener('reset', listener)
    return () => form.removeEventListener('reset', listener)
  }, [fieldRef])
}
