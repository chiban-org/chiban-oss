import { asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { notificationOutbox } from '@/db/schema'
import { revokeSystemClaim } from '@/features/contractors/systemClaim'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import {
  accountDelivery,
  type Delivery,
  type DropReason,
  type OutboxRow,
  partyDelivery,
} from '@/features/notifications/delivery'
import { MESSAGES } from '@/features/notifications/messages'
import type { NotificationPayload } from '@/features/notifications/queue'
import { err, type Result } from '@/types/result'

const MAX_ATTEMPTS = 5
const BATCH = 100

async function drop(db: DbOrTx, id: string, reason: DropReason): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ status: 'dropped', dropReason: reason })
    .where(eq(notificationOutbox.id, id))
}

async function deliver(
  mail: MailTransport,
  message: MailMessage,
  signal: AbortSignal,
): Promise<Result<void, 'send_failed'>> {
  try {
    return await mail.send(message, signal)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err('send_failed')
  }
}

async function deliveryFor(
  db: DbOrTx,
  row: OutboxRow,
  signal: AbortSignal,
  now: Date,
): Promise<Delivery> {
  if (row.recipientUserId !== null) {
    return await accountDelivery(db, row, row.recipientUserId, signal)
  }
  if (row.recipientPartyId !== null) {
    return await partyDelivery(db, row, { partyId: row.recipientPartyId, now }, signal)
  }
  return { kind: 'drop', reason: 'no_access' }
}

async function recordOutcome(db: DbOrTx, row: OutboxRow, sent: boolean, now: Date): Promise<void> {
  if (sent) {
    await db
      .update(notificationOutbox)
      .set({ status: 'sent', sentAt: now, attempts: sql`${notificationOutbox.attempts} + 1` })
      .where(eq(notificationOutbox.id, row.id))
    return
  }
  const attempts = row.attempts + 1
  await db
    .update(notificationOutbox)
    .set({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued' })
    .where(eq(notificationOutbox.id, row.id))
}

export async function sendQueuedNotifications(
  db: DbOrTx,
  mail: MailTransport,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<number> {
  const queued = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.status, 'queued'))
    .orderBy(asc(notificationOutbox.createdAt))
    .limit(BATCH)
  let sent = 0
  for (const row of queued) {
    signal.throwIfAborted()
    const delivery = await deliveryFor(db, row, signal, now)
    if (delivery.kind === 'drop') {
      await drop(db, row.id, delivery.reason)
      continue
    }
    const message = MESSAGES[row.event]({
      applicationId: row.applicationId,
      payload: row.payload as NotificationPayload,
      ...(delivery.claim === undefined ? {} : { claim: delivery.claim }),
    })
    const result = await deliver(mail, { to: delivery.to, ...message }, signal)
    if (!result.ok && delivery.claim !== undefined) {
      await revokeSystemClaim(db, delivery.claim.claimId, now)
    }
    await recordOutcome(db, row, result.ok, now)
    if (result.ok) sent += 1
  }
  return sent
}
