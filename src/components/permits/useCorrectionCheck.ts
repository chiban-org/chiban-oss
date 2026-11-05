'use client'

import { useEffect, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'

export type CheckOutcome =
  | {
      ok: true
      feeLine: string
      refusal: string | null
      notify: string[]
      fieldErrors: Record<string, string>
    }
  | { ok: false; error: string }

const PAUSE_MS = 400

export function useCorrectionCheck(
  check: (formData: FormData) => Promise<CheckOutcome>,
  fields: Record<string, string>,
): CheckOutcome | null {
  const csrf = useCsrfToken()
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null)
  const key = JSON.stringify(fields)
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      const data = new FormData()
      data.set('csrf_token', csrf)
      for (const [name, value] of Object.entries(JSON.parse(key) as Record<string, string>)) {
        data.set(name, value)
      }
      check(data)
        .then((result) => {
          if (live) setOutcome(result)
        })
        .catch(() => {
          if (live) setOutcome({ ok: false, error: 'The fee check could not run. Try again.' })
        })
    }, PAUSE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [check, csrf, key])
  return outcome
}
