'use client'

import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { Button } from '@/components/ui/button'
import { attempt } from '@/lib/attempt'
import { formatCents } from '@/lib/money'

export type PayResult = { ok: true; redirectUrl: string } | { ok: false; error: string }

interface Props {
  applicationId: string
  dueCents: number
  start: (formData: FormData) => Promise<PayResult>
  navigate?: (url: string) => void
}

const defaultNavigate = (url: string): void => window.location.assign(url)

export function PayButton({ applicationId, dueCents, start, navigate = defaultNavigate }: Props) {
  const csrf = useCsrfToken()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    const data = new FormData()
    data.set('csrf_token', csrf)
    data.set('applicationId', applicationId)
    const outcome = await attempt(() => start(data), setPending)
    const result: PayResult = outcome.ok ? outcome.value : { ok: false, error: outcome.error }
    if (result.ok) navigate(result.redirectUrl)
    else setError(result.error)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        className="min-h-11 text-base"
        disabled={pending}
        onClick={() => void onClick()}
      >
        {`Pay ${formatCents(dueCents)}`}
      </Button>
      {error === null ? null : (
        <p role="alert" className="m-0 text-base">
          {error}
        </p>
      )}
    </div>
  )
}
