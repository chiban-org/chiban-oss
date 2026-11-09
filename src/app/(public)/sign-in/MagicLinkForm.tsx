'use client'

import { useActionState, useState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { RequiredNote } from '@/components/ui/required-mark'
import { type MagicLinkState, requestMagicLinkAction } from './actions'

const initial: MagicLinkState = { message: null }

function NextField({ next }: { next: string | undefined }) {
  return next === undefined ? null : <input type="hidden" name="next" value={next} />
}

function CheckEmail({
  sentTo,
  message,
  next,
  action,
  onRestart,
}: {
  sentTo: string
  message: string | null
  next: string | undefined
  action: (formData: FormData) => void
  onRestart: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0">{`Check ${sentTo}`}</h2>
      <p role="status" className="m-0">
        {message}
      </p>
      <p className="m-0">Open the email on this device and follow the link to sign in.</p>
      <div className="flex flex-wrap items-center gap-3">
        <form action={action}>
          <CsrfField />
          <NextField next={next} />
          <input type="hidden" name="email" value={sentTo} />
          <SubmitButton variant="outline">Send again</SubmitButton>
        </form>
        <Button type="button" variant="outline" className="min-h-11" onClick={onRestart}>
          Use a different email
        </Button>
      </div>
    </div>
  )
}

export function MagicLinkForm({ next }: { next?: string }) {
  const [state, action] = useActionState(requestMagicLinkAction, initial)
  const [restartedFrom, setRestartedFrom] = useState<MagicLinkState | null>(null)
  const sentTo = state === restartedFrom ? undefined : state.sentTo
  if (sentTo !== undefined) {
    return (
      <CheckEmail
        sentTo={sentTo}
        message={state.message}
        next={next}
        action={action}
        onRestart={() => setRestartedFrom(state)}
      />
    )
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <RequiredNote />
      <CsrfField />
      <NextField next={next} />
      <TextField label="Email address" name="email" type="email" autoComplete="email" required />
      {state.message === null || state === restartedFrom ? null : (
        <p role="status">{state.message}</p>
      )}
      <SubmitButton>Email me a sign-in link</SubmitButton>
    </form>
  )
}
