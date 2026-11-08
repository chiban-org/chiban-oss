'use client'

import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import { Button } from '@/components/ui/button'
import { attempt } from '@/lib/attempt'

export type ClaimResult = { ok: true; message: string } | { ok: false; error: string }

interface Props {
  applicationId: string
  send: (formData: FormData) => Promise<ClaimResult>
  label?: string
}

export function ClaimLinkButton({
  applicationId,
  send,
  label = 'Send claim link to contractor',
}: Props) {
  const csrf = useCsrfToken()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ClaimResult | null>(null)

  const onClick = async () => {
    const data = new FormData()
    data.set('applicationId', applicationId)
    data.set('csrf_token', csrf)
    const outcome = await attempt(() => send(data), setPending)
    setResult(outcome.ok ? outcome.value : { ok: false, error: outcome.error })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={pending} onClick={() => void onClick()}>
        {label}
      </Button>
      {result === null ? null : <p role="status">{result.ok ? result.message : result.error}</p>}
    </div>
  )
}
