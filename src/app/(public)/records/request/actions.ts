'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db/client'
import { clientKey } from '@/features/anonymousIntake/clientKey'
import { emailAddress, optionalPhone, optionalText, requiredText } from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import { MAX_REQUEST_CHARS, submitOnlineRequest } from '@/features/rtk/onlineRequest'
import { guardAction } from '@/server/actionGuard'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'

const TIMEOUT_MS = 30_000

const FieldsSchema = z.object({
  description: requiredText('the records you are asking for', { max: MAX_REQUEST_CHARS }),
  requesterName: optionalText('your name', { max: 200 }),
  email: emailAddress('your email address'),
  phone: optionalPhone('your phone'),
})

const REFUSED = {
  invalid: 'The request could not be saved. Check each field and try again.',
  rate_limited: 'Too many requests were sent from here. Wait an hour and try again.',
} as const

export async function submitRecordsRequestAction(formData: FormData): Promise<ActionResult> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { ok: false, error: errorCopy(guard.error) }
  const fields = parseForm(FieldsSchema, formData)
  if (!fields.ok) return fields.error
  const v = fields.value
  const result = await submitOnlineRequest(
    { db, mail: getMailTransport(), signal },
    {
      description: v.description,
      email: v.email,
      clientKey: clientKey((await headers()).get('x-forwarded-for')),
      ...(v.requesterName === null ? {} : { requesterName: v.requesterName }),
      ...(v.phone === null ? {} : { phone: v.phone }),
    },
  )
  if (!result.ok) return { ok: false, error: REFUSED[result.error] }
  const receipt = result.value
  redirect(
    `/records/request/received?ref=${encodeURIComponent(receipt.number)}&due=${receipt.due}&emailed=${receipt.emailed ? '1' : '0'}`,
  )
}
