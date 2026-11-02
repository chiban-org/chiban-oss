'use client'

import { useEffect, useState } from 'react'
import { ensureCsrfAction } from '@/features/auth/csrfRefresh'

export function CsrfField() {
  const [token, setToken] = useState('')

  useEffect(() => {
    let live = true
    void ensureCsrfAction().then((value) => {
      if (live) setToken(value)
    })
    return () => {
      live = false
    }
  }, [])

  return <input type="hidden" name="csrf_token" value={token} readOnly />
}
