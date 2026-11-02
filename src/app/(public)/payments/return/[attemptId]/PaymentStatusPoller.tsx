'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 120_000

export function PaymentStatusPoller() {
  const router = useRouter()
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - started >= POLL_LIMIT_MS) {
        clearInterval(timer)
        return
      }
      router.refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [router])
  return null
}
