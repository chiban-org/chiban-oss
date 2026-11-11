import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { getMailTransport } from '@/features/mail/transport'
import { deliverRequestLetter, type LetterDelivered } from '@/features/rtk/letterDelivery'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { type FieldOf, recordsOutcome } from '@/server/recordsAction'
import type { Result } from '@/types/result'

function sentLine(lead: string, delivered: LetterDelivered | null): string {
  if (delivered?.outcome === 'emailed')
    return `${lead} and the letter emailed to ${delivered.sentTo}.`
  if (delivered?.outcome === 'email_failed')
    return `${lead} and the letter filed, but the email could not be sent. Print it from Letters and send it to the requester.`
  return `${lead} and the letter filed. Print it from Letters and send it to the requester.`
}

export async function sendLetterOutcome(
  ctx: { db: Db; actor: Actor; signal: AbortSignal },
  outcome: { requestId: string; result: Result<{ letterDocumentId: string }, string> },
  copy: { lead: string; fieldOf: FieldOf },
): Promise<ActionResult> {
  const { result } = outcome
  if (!result.ok) return recordsOutcome(result, '', copy.fieldOf)
  const delivered = await deliverRequestLetter(
    { db: ctx.db, store: getObjectStore(), mail: getMailTransport(), signal: ctx.signal },
    ctx.actor,
    { requestId: outcome.requestId, documentId: result.value.letterDocumentId },
  )
  return { ok: true, message: sentLine(copy.lead, delivered.ok ? delivered.value : null) }
}
