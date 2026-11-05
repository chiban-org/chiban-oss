'use client'

import { useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/staff/fields'
import { RequiredNote } from '@/components/ui/required-mark'
import { type MagicLinkState, requestMagicLinkAction } from './actions'

const initial: MagicLinkState = { message: null }

export function MagicLinkForm({ next }: { next?: string }) {
  const [state, action] = useActionState(requestMagicLinkAction, initial)

  return (
    <form action={action} className="flex flex-col gap-4">
      <RequiredNote />
      <CsrfField />
      {next === undefined ? null : <input type="hidden" name="next" value={next} />}
      <TextField label="Email address" name="email" type="email" autoComplete="email" required />
      {state.message === null ? null : <p role="status">{state.message}</p>}
      <SubmitButton>Email me a sign-in link</SubmitButton>
    </form>
  )
}
