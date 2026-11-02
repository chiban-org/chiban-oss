'use client'

import { useEffect, useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { ensureCsrfAction } from '@/features/auth/csrfRefresh'

export function CsrfField() {
  const provided = useCsrfToken()
  const [refreshed, setRefreshed] = useState('')
  const token = provided === '' ? refreshed : provided

  useEffect(() => {
    if (provided !== '') return
    let live = true
    void ensureCsrfAction().then((value) => {
      if (live) setRefreshed(value)
    })
    return () => {
      live = false
    }
  }, [provided])

  return <input type="hidden" name="csrf_token" value={token} readOnly />
}
