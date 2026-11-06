'use server'

import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { errorCopy, text } from '@/server/actionRunner'
import { withPortalActor } from '@/server/portalAction'
import { isUuid } from '@/utils/uuid'

export type PaymentResponse = { ok: true; redirectUrl: string } | { ok: false; error: string }

const PAY_COPY = {
  not_found: 'You cannot pay for this application.',
  nothing_due: 'Nothing is due right now.',
  not_configured: 'Online payment is not set up yet. Ask the land use office.',
} as const

export async function startPaymentAction(formData: FormData): Promise<PaymentResponse> {
  return await withPortalActor(
    formData,
    (error): PaymentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const applicationId = text(formData, 'applicationId')
      if (!isUuid(applicationId)) return { ok: false, error: errorCopy('invalid_input') }
      const [user] = await db
        .select({ name: users.displayName, email: users.email })
        .from(users)
        .where(eq(users.id, actor.userId))
      const started = await startOnlinePayment(
        db,
        actor,
        {
          applicationIds: [applicationId],
          payerName: user?.name ?? 'Applicant',
          payerEmail: user?.email,
        },
        signal,
      )
      if (started.ok) return { ok: true, redirectUrl: started.value.redirectUrl }
      const known = typeof started.error === 'string' ? PAY_COPY[started.error] : undefined
      return { ok: false, error: known ?? 'The payment service had a problem. Try again later.' }
    },
  )
}
