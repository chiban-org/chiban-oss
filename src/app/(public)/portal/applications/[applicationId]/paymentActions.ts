'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@/db/schema'
import { recordId } from '@/features/input/schemas'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { loadOfficeName } from '@/features/pdf/officeName'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

export type PaymentResponse = { ok: true; redirectUrl: string } | { ok: false; error: string }

function payCopy(officeName: string) {
  return {
    not_found: 'You cannot pay for this application.',
    nothing_due: 'Nothing is due right now.',
    not_configured: `Online payment is not set up yet. Ask the ${officeName}.`,
  } as const
}

const PayForm = z.object({ applicationId: recordId('an application') })

export async function startPaymentAction(formData: FormData): Promise<PaymentResponse> {
  return await withPortalActor(
    formData,
    (error): PaymentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const parsed = parseForm(PayForm, formData)
      if (!parsed.ok) return { ok: false, error: parsed.error.error }
      const { applicationId } = parsed.value
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
      const office = await loadOfficeName(db, signal)
      const known = typeof started.error === 'string' ? payCopy(office)[started.error] : undefined
      return { ok: false, error: known ?? 'The payment service had a problem. Try again later.' }
    },
  )
}
