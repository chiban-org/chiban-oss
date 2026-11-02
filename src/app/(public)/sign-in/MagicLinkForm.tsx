'use client'

import { useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { type MagicLinkState, requestMagicLinkAction } from './actions'

const initial: MagicLinkState = { message: null }

export function MagicLinkForm() {
  const [state, action] = useActionState(requestMagicLinkAction, initial)

  return (
    <form action={action} className="flex flex-col gap-4">
      <CsrfField />
      <label className="flex flex-col gap-1">
        <span>Email address</span>
        <input name="email" type="email" autoComplete="email" required className="border p-2" />
      </label>
      {state.message === null ? null : <p role="status">{state.message}</p>}
      <SubmitButton className="p-2">Email me a sign-in link</SubmitButton>
    </form>
  )
}
