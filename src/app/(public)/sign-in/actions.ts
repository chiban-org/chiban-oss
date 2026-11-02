'use server'

import { z } from 'zod'
import { db } from '@/db/client'
import { requestMagicLink } from '@/features/auth/magicLink'
import { getMailTransport } from '@/features/mail/transport'
import { guardAction } from '@/server/actionGuard'

export interface MagicLinkState {
  message: string | null
}

const emailSchema = z.object({ email: z.email() })
const nextSchema = z.string().max(300).optional()

export async function requestMagicLinkAction(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) return { message: 'Your session expired. Reload the page and try again.' }
  const parsed = emailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { message: 'Enter a valid email address.' }
  const next = nextSchema.safeParse(formData.get('next') ?? undefined)
  const result = await requestMagicLink(
    db,
    getMailTransport(),
    parsed.data.email,
    signal,
    next.success ? next.data : undefined,
  )
  if (!result.ok) return { message: 'Too many requests. Try again in a few minutes.' }
  return { message: 'If that address can sign in, a link is on its way. It expires in 15 minutes.' }
}
