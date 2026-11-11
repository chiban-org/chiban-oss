'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { db } from '@/db/client'
import { clientKey } from '@/features/anonymousIntake/clientKey'
import { requestMagicLink } from '@/features/auth/magicLink'
import { emailAddress } from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import { guardAction } from '@/server/actionGuard'
import { parseForm } from '@/server/formInput'

export type ContractorLinkState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'refused'; message: string }

const CONTRACTOR_SETUP_PATH = '/account?setup=contractor'
const emailSchema = z.object({ email: emailAddress('an email address') })

export async function requestContractorLinkAction(
  _prev: ContractorLinkState,
  formData: FormData,
): Promise<ContractorLinkState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok)
    return { status: 'refused', message: 'Your session expired. Reload the page and try again.' }
  const parsed = parseForm(emailSchema, formData)
  if (!parsed.ok) return { status: 'refused', message: parsed.error.error }
  const result = await requestMagicLink(
    db,
    getMailTransport(),
    {
      email: parsed.value.email,
      clientKey: clientKey((await headers()).get('x-forwarded-for')),
      next: CONTRACTOR_SETUP_PATH,
    },
    signal,
  )
  if (!result.ok)
    return { status: 'refused', message: 'Too many requests. Try again in a few minutes.' }
  return { status: 'sent', email: parsed.value.email.trim().toLowerCase() }
}
