'use client'

import { useActionState } from 'react'
import { CsrfField } from '@/components/CsrfField'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/staff/fields'
import { RequiredNote } from '@/components/ui/required-mark'
import { type ContractorLinkState, requestContractorLinkAction } from './actions'

const initial: ContractorLinkState = { status: 'idle' }

interface Props {
  townName: string
  linkMinutes: number
}

export function ContractorSignUpForm({ townName, linkMinutes }: Props) {
  const [state, action] = useActionState(requestContractorLinkAction, initial)
  if (state.status === 'sent') {
    return (
      <div role="status" className="space-y-2">
        <p className="font-semibold">{`Check ${state.email} for a link from ${townName}.`}</p>
        <p>{`It works once, for ${linkMinutes} minutes. Opening it signs you in and takes you to your contractor details.`}</p>
      </div>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <RequiredNote />
      <CsrfField />
      <TextField label="Email address" name="email" type="email" autoComplete="email" required />
      {state.status === 'refused' ? <p role="alert">{state.message}</p> : null}
      <SubmitButton>Email me a sign-in link</SubmitButton>
    </form>
  )
}
