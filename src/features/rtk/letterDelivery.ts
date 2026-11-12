import { asc, eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { type RtkLetterOutcome, rtkLetterDeliveries, rtkRequests } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { MailAttachment, MailTransport } from '@/features/mail/transport'
import { publishedWording, townName } from '@/features/notifications/messageSettings'
import { requestLetterValues } from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { wordingFor } from '@/features/notifications/wording/wordingEdits'
import { attachmentsOf, originalFileOf } from '@/features/rtk/releaseDelivery'
import { requesterEmailOf } from '@/features/rtk/requesterEmail'
import type { ObjectStore } from '@/features/storage/objectStore'
import { log } from '@/server/log'
import { err, ok, type Result } from '@/types/result'

export interface LetterDeliveryContext {
  db: Db
  store: ObjectStore
  mail: MailTransport
  signal: AbortSignal
}

export interface LetterDelivered {
  outcome: RtkLetterOutcome
  sentTo: string | null
}

async function letterAttachments(
  ctx: LetterDeliveryContext,
  documentId: string,
): Promise<MailAttachment[] | null> {
  const letter = await originalFileOf(ctx.db, documentId)
  if (letter === undefined) return null
  return await attachmentsOf(ctx.store, [letter], ctx.signal)
}

async function emailLetter(
  ctx: LetterDeliveryContext,
  to: string,
  number: string,
  documentId: string,
): Promise<boolean> {
  const attachments = await letterAttachments(ctx, documentId)
  if (attachments === null) return false
  const [name, overrides] = await Promise.all([
    townName(ctx.db, ctx.signal),
    publishedWording(ctx.db, ctx.signal),
  ])
  const rendered = renderWording(
    wordingFor('rtk_letter_sent', overrides),
    { ...requestLetterValues(number), 'town.name': name },
    null,
  )
  const sent = await ctx.mail.send({ to, ...rendered, attachments }, ctx.signal)
  if (!sent.ok) log.warn('[rtk] letter email not sent', number)
  return sent.ok
}

export async function deliverRequestLetter(
  ctx: LetterDeliveryContext,
  actor: Actor,
  letter: { requestId: string; documentId: string },
): Promise<Result<LetterDelivered, 'forbidden' | 'not_found'>> {
  ctx.signal.throwIfAborted()
  const allowed = await requireCapability(ctx.db, actor.userId, 'rtk.manage', ctx.signal)
  if (!allowed.ok) return err('forbidden')
  const [request] = await ctx.db
    .select({ number: rtkRequests.number, contact: rtkRequests.requesterContact })
    .from(rtkRequests)
    .where(eq(rtkRequests.id, letter.requestId))
  if (request === undefined) return err('not_found')
  const sentTo = requesterEmailOf(request.contact)
  let outcome: RtkLetterOutcome = 'print'
  if (sentTo !== null) {
    const emailed = await emailLetter(ctx, sentTo, request.number, letter.documentId)
    outcome = emailed ? 'emailed' : 'email_failed'
  }
  await ctx.db.transaction(async (tx) => {
    await tx.insert(rtkLetterDeliveries).values({
      requestId: letter.requestId,
      documentId: letter.documentId,
      outcome,
      sentTo,
      createdBy: actor.userId,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.letter_delivered',
        entityType: 'rtk_request',
        entityId: letter.requestId,
        after: { documentId: letter.documentId, outcome, sentTo },
      },
      ctx.signal,
    )
  })
  return ok({ outcome, sentTo })
}

export async function letterDeliveries(db: DbOrTx, requestId: string) {
  return await db
    .select({
      documentId: rtkLetterDeliveries.documentId,
      outcome: rtkLetterDeliveries.outcome,
      sentTo: rtkLetterDeliveries.sentTo,
      at: rtkLetterDeliveries.createdAt,
    })
    .from(rtkLetterDeliveries)
    .where(eq(rtkLetterDeliveries.requestId, requestId))
    .orderBy(asc(rtkLetterDeliveries.createdAt))
}
