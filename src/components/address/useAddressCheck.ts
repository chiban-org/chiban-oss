'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import type { AddressSuggestion } from '@/features/address/suggestionLayout'
import { suggestAddress } from '@/server/suggestAddress'

const PAUSE_MS = 800

export interface AddressCheckState {
  suggestion: AddressSuggestion | null
  edited: (lines: readonly string[]) => void
  left: (lines: readonly string[]) => void
  reset: () => void
}

function isBlank(lines: readonly string[]): boolean {
  return lines.every((line) => line.trim() === '')
}

export function useAddressCheck(): AddressCheckState {
  const csrf = useCsrfToken()
  const [suggestion, setSuggestion] = useState<AddressSuggestion | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sequence = useRef(0)
  const asked = useRef<string | null>(null)
  const touched = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const ask = useCallback(
    async (lines: readonly string[]) => {
      const key = lines.join('\n')
      if (key === asked.current || isBlank(lines)) return
      asked.current = key
      sequence.current += 1
      const mine = sequence.current
      const found = await suggestAddress({ csrfToken: csrf, lines: [...lines] }).catch(() => null)
      if (mine === sequence.current) setSuggestion(found)
    },
    [csrf],
  )

  const reset = useCallback(() => {
    cancel()
    sequence.current += 1
    asked.current = null
    setSuggestion(null)
  }, [cancel])

  const edited = useCallback(
    (lines: readonly string[]) => {
      reset()
      touched.current = true
      timer.current = setTimeout(() => void ask(lines), PAUSE_MS)
    },
    [ask, reset],
  )

  const left = useCallback(
    (lines: readonly string[]) => {
      if (!touched.current) return
      cancel()
      void ask(lines)
    },
    [ask, cancel],
  )

  useEffect(() => cancel, [cancel])

  return { suggestion, edited, left, reset }
}
