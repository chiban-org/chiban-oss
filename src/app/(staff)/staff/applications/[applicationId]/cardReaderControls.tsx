'use client'

import { useCsrfToken } from '@/components/CsrfProvider'
import type { ReaderStatus } from '@/components/counter/counterTypes'
import { Button } from '@/components/ui/button'
import type { CardActions, ReaderOutcome } from './cardTypes'

export type Phase = 'idle' | 'waiting' | 'unknown' | 'approved' | 'declined'

export function payload(csrf: string, fields: Record<string, string>): FormData {
  const data = new FormData()
  data.set('csrf_token', csrf)
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

export function phaseOf(status: Extract<ReaderStatus, { ok: true }>): Phase {
  if (status.outcomeUnknown) return 'unknown'
  if (status.state === 'captured' || status.state === 'settled') return 'approved'
  if (status.state === 'declined' || status.state === 'voided') return 'declined'
  return 'waiting'
}

export function phaseSentence(phase: Exclude<Phase, 'idle'>): string {
  switch (phase) {
    case 'waiting':
      return 'Waiting for the card on the reader. Nothing is posted until the processor approves.'
    case 'unknown':
      return 'Outcome unknown. Do not take the payment another way until the processor confirms.'
    case 'approved':
      return 'Card approved. The payment is in the ledger.'
    case 'declined':
      return 'Card declined. Nothing was charged and the balance is unchanged.'
  }
}

type Run = (call: () => Promise<ReaderStatus>) => void

interface ControlProps {
  phase: 'waiting' | 'unknown'
  attemptId: string
  simulated: boolean
  pending: boolean
  actions: CardActions
  run: Run
}

export function CardReaderControls({
  phase,
  attemptId,
  simulated,
  pending,
  actions,
  run,
}: ControlProps) {
  const csrf = useCsrfToken()
  const button = (label: string, send: () => Promise<ReaderStatus>) => (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(send)}>
      {label}
    </Button>
  )
  const reader = (label: string, outcome: ReaderOutcome) =>
    button(label, () => actions.reader(payload(csrf, { attemptId, outcome })))
  const reconnect = (label: string, outcome: Exclude<ReaderOutcome, 'unknown'>) =>
    button(label, () => actions.reconnect(payload(csrf, { attemptId, outcome })))
  return (
    <div className="flex flex-wrap gap-3">
      {button('Check with processor', () => actions.check(payload(csrf, { attemptId })))}
      {simulated && phase === 'waiting' ? (
        <>
          {reader('Approve', 'captured')}
          {reader('Decline', 'declined')}
          {reader('Lose connection', 'unknown')}
        </>
      ) : null}
      {simulated && phase === 'unknown' ? (
        <>
          {reconnect('Reader reconnected: approved', 'captured')}
          {reconnect('Reader reconnected: declined', 'declined')}
        </>
      ) : null}
    </div>
  )
}
