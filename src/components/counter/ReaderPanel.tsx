'use client'

import { useState } from 'react'
import { useCsrfToken } from '@/components/CsrfProvider'
import type {
  CounterActions,
  CounterOutcome,
  ReaderStatus,
} from '@/components/counter/counterTypes'
import { Button } from '@/components/ui/button'
import { attempt } from '@/lib/attempt'

interface Props {
  attemptId: string
  applicationId: string
  simulated: boolean
  actions: CounterActions
  onIssued: (outcome: CounterOutcome) => void
  onDeclined?: () => void
}

type Phase = 'waiting' | 'unknown' | 'declined' | 'issuing' | 'done'

function payload(csrf: string, fields: Record<string, string>): FormData {
  const data = new FormData()
  data.set('csrf_token', csrf)
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

export function ReaderPanel({
  attemptId,
  applicationId,
  simulated,
  actions,
  onIssued,
  onDeclined,
}: Props) {
  const csrf = useCsrfToken()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  const finish = async () => {
    setPhase('issuing')
    const done = await attempt(() => actions.complete(payload(csrf, { applicationId })), setPending)
    const outcome: CounterOutcome = done.ok ? done.value : { ok: false, error: done.error }
    if (outcome.ok && outcome.state === 'issued') {
      setPhase('done')
      onIssued(outcome)
      return
    }
    setPhase('unknown')
    setMessage(outcome.ok ? 'The permit is not issued yet.' : outcome.error)
  }

  const apply = async (status: ReaderStatus) => {
    if (!status.ok) {
      setMessage(status.error)
      return
    }
    setMessage('')
    if (status.outcomeUnknown) setPhase('unknown')
    else if (status.state === 'captured' || status.state === 'settled') await finish()
    else if (status.state === 'declined' || status.state === 'voided') {
      setPhase('declined')
      setMessage(
        'Card declined. The permit is not issued. Try the card again or choose another way to pay.',
      )
      onDeclined?.()
    } else setPhase('waiting')
  }

  const run = async (call: () => Promise<ReaderStatus>) => {
    const result = await attempt(call, setPending)
    await apply(result.ok ? result.value : { ok: false, error: result.error })
  }

  const readerButton = (label: string, outcome: 'captured' | 'declined' | 'unknown') => (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void run(() => actions.reader(payload(csrf, { attemptId, outcome })))}
    >
      {label}
    </Button>
  )

  const reconnectButton = (label: string, outcome: 'captured' | 'declined') => (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void run(() => actions.reconnect(payload(csrf, { attemptId, outcome })))}
    >
      {label}
    </Button>
  )

  return (
    <section aria-label="Card reader" className="space-y-3 rounded-md border p-4">
      <h2>Present card on reader</h2>
      {simulated ? (
        <p className="rounded-md border p-2 text-sm font-semibold">
          SIMULATED reader: not connected to a live card reader or processor. No card is charged.
        </p>
      ) : null}
      {phase === 'unknown' ? (
        <p role="alert" className="rounded-md bg-highlight p-3 font-semibold">
          Outcome unknown. Do not issue.
        </p>
      ) : null}
      {phase === 'declined' || message !== '' ? <p role="status">{message}</p> : null}
      {phase === 'waiting' && simulated ? (
        <div className="flex flex-wrap gap-3">
          {readerButton('Approve', 'captured')}
          {readerButton('Decline', 'declined')}
          {readerButton('Lose connection', 'unknown')}
        </div>
      ) : null}
      {phase === 'unknown' ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => void run(() => actions.check(payload(csrf, { attemptId })))}
          >
            Check with processor
          </Button>
          {simulated ? reconnectButton('Reader reconnected: approved', 'captured') : null}
          {simulated ? reconnectButton('Reader reconnected: declined', 'declined') : null}
        </div>
      ) : null}
    </section>
  )
}
