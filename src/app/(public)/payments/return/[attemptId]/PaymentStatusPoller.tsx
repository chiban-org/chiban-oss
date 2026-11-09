'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 120_000

export function PaymentStatusPoller() {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - started >= POLL_LIMIT_MS) {
        clearInterval(timer)
        setTimedOut(true)
        return
      }
      router.refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [router])
  return (
    <p role="status" className="max-w-[65ch]">
      {timedOut
        ? 'Still waiting on the processor. You will not be charged twice.'
        : 'We are waiting for the payment processor to confirm. This page checks again every few seconds. Nothing is marked paid until the processor confirms.'}
    </p>
  )
}
