'use client'

import { createContext, type ReactNode, useContext, useId, useMemo } from 'react'

export type FieldErrorMap = Readonly<Record<string, string>>

export interface FieldErrorView {
  message: string
  id: string
}

const FieldErrorsContext = createContext<{ errors: FieldErrorMap; idPrefix: string }>({
  errors: {},
  idPrefix: '',
})

export function FieldErrorsProvider({
  errors,
  children,
}: {
  errors: FieldErrorMap
  children: ReactNode
}) {
  const idPrefix = useId()
  const value = useMemo(() => ({ errors, idPrefix }), [errors, idPrefix])
  return <FieldErrorsContext value={value}>{children}</FieldErrorsContext>
}

export function useFieldError(name: string | undefined): FieldErrorView | null {
  const { errors, idPrefix } = useContext(FieldErrorsContext)
  const message = name === undefined ? undefined : errors[name]
  return message === undefined ? null : { message, id: `${idPrefix}-${name}-error` }
}

export function useControlAria(name: string | undefined, hintId: string | undefined) {
  const error = useFieldError(name)
  const ids = [hintId, error?.id].filter((id): id is string => id !== undefined)
  return {
    error,
    aria: {
      'aria-describedby': ids.length === 0 ? undefined : ids.join(' '),
      'aria-invalid': error === null ? undefined : true,
    },
  }
}

export function FieldErrorMessage({ error }: { error: FieldErrorView | null | undefined }) {
  if (error === null || error === undefined) return null
  return (
    <p id={error.id} className="m-0 text-sm font-semibold text-status-failed-fg">
      {error.message}
    </p>
  )
}
