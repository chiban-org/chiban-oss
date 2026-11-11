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

export interface MagicLinkState {
  message: string | null
  sentTo?: string
}

const emailSchema = z.object({ email: emailAddress('an email address') })
const nextSchema = z.string().max(300).optional()

export async function requestMagicLinkAction(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) return { message: 'Your session expired. Reload the page and try again.' }
  const parsed = parseForm(emailSchema, formData)
  if (!parsed.ok) return { message: parsed.error.error }
  const next = nextSchema.safeParse(formData.get('next') ?? undefined)
  const result = await requestMagicLink(
    db,
    getMailTransport(),
    {
      email: parsed.value.email,
      clientKey: clientKey((await headers()).get('x-forwarded-for')),
      ...(next.success && next.data !== undefined ? { next: next.data } : {}),
    },
    signal,
  )
  if (!result.ok) return { message: 'Too many requests. Try again in a few minutes.' }
  return {
    message: 'If that address can sign in, a link is on its way. It expires in 15 minutes.',
    sentTo: parsed.value.email,
  }
}
