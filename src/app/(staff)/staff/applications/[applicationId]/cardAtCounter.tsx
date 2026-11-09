'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCsrfToken } from '@/components/CsrfProvider'
import type { ReaderStatus } from '@/components/counter/counterTypes'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { attempt } from '@/lib/attempt'
import { formatCents } from '@/lib/money'
import {
  CardReaderControls,
  type Phase,
  payload,
  phaseOf,
  phaseSentence,
} from './cardReaderControls'
import type { CardActions, CardStartResult } from './cardTypes'

interface Props {
  applicationId: string
  dueCents: number
  feeCents: number
  simulated: boolean
  actions: CardActions
  resume?: { attemptId: string; outcomeUnknown: boolean } | null
}

const NOT_REPORTED = 'The processor has not reported an outcome yet. Check again in a moment.'

function chargeSentence(dueCents: number, feeCents: number): string {
  if (feeCents === 0) return `The reader charges ${formatCents(dueCents)}.`
  return `The reader charges ${formatCents(dueCents + feeCents)}: ${formatCents(dueCents)} due plus a ${formatCents(feeCents)} card fee.`
}

function StartForm({
  sentence,
  pending,
  onStart,
}: {
  sentence: string
  pending: boolean
  onStart: (payerName: string) => void
}) {
  const [payerName, setPayerName] = useState('')
  return (
    <>
      <p>{sentence}</p>
      <TextField
        label="Name of the person paying by card"
        name="cardPayerName"
        value={payerName}
        onChange={(event) => setPayerName(event.target.value)}
        required
      />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={pending || payerName.trim() === ''}
        onClick={() => onStart(payerName)}
      >
        Start card payment
      </Button>
    </>
  )
}

export function CardAtCounter({
  applicationId,
  dueCents,
  feeCents,
  simulated,
  actions,
  resume = null,
}: Props) {
  const csrf = useCsrfToken()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>(
    resume === null ? 'idle' : resume.outcomeUnknown ? 'unknown' : 'waiting',
  )
  const [attemptId, setAttemptId] = useState(resume?.attemptId ?? '')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  const run = async (call: () => Promise<ReaderStatus>) => {
    const result = await attempt(call, setPending)
    const status: ReaderStatus = result.ok ? result.value : { ok: false, error: result.error }
    if (!status.ok) {
      setMessage(status.error)
      return
    }
    const next = phaseOf(status)
    setPhase(next)
    setMessage(next === 'waiting' || next === 'unknown' ? NOT_REPORTED : '')
    if (next !== 'approved') return
    toast.success(phaseSentence('approved'))
    router.refresh()
  }

  const start = async (payerName: string) => {
    const result = await attempt(
      () => actions.start(payload(csrf, { applicationId, payerName })),
      setPending,
    )
    const started: CardStartResult = result.ok ? result.value : { ok: false, error: result.error }
    if (!started.ok) {
      setMessage(started.error)
      return
    }
    setAttemptId(started.attemptId)
    setMessage('')
    setPhase(started.outcomeUnknown ? 'unknown' : 'waiting')
  }

  return (
    <div
      role="group"
      aria-label="Card at the counter"
      className="mt-4 flex flex-col gap-3 border-t pt-4 [&>p]:m-0"
    >
      <p className="font-semibold">Card at the counter</p>
      {simulated ? (
        <p className="text-sm font-semibold">
          SIMULATED reader: not connected to a live card reader or processor. No card is charged.
        </p>
      ) : null}
      {phase === 'idle' ? (
        <StartForm
          sentence={chargeSentence(dueCents, feeCents)}
          pending={pending}
          onStart={(name) => void start(name)}
        />
      ) : (
        <p role={phase === 'unknown' ? 'alert' : undefined} className="font-semibold">
          {phaseSentence(phase)}
        </p>
      )}
      {message === '' ? null : <p role="status">{message}</p>}
      {phase === 'waiting' || phase === 'unknown' ? (
        <Link href={`/staff/payments/${attemptId}`} className="self-start">
          Open the card payment
        </Link>
      ) : null}
      {phase === 'waiting' || phase === 'unknown' ? (
        <CardReaderControls
          phase={phase}
          attemptId={attemptId}
          simulated={simulated}
          pending={pending}
          actions={actions}
          run={(call) => void run(call)}
        />
      ) : null}
      {phase === 'declined' ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setPhase('idle')}
        >
          Try the card again
        </Button>
      ) : null}
    </div>
  )
}
