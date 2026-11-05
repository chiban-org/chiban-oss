import { and, asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { notificationOutbox, users } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import { type Actor, loadActor } from '@/features/auth/actor'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import { MESSAGES } from '@/features/notifications/messages'
import type { NotificationPayload } from '@/features/notifications/queue'
import { isRemovalNoticeToFormerContractor } from '@/features/notifications/removedContractor'
import { err, type Result } from '@/types/result'

const MAX_ATTEMPTS = 5
const BATCH = 100

async function drop(db: DbOrTx, id: string, reason: 'no_access' | 'inactive_user'): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ status: 'dropped', dropReason: reason })
    .where(eq(notificationOutbox.id, id))
}

async function mayReceive(
  db: DbOrTx,
  row: typeof notificationOutbox.$inferSelect,
  actor: Actor,
  signal: AbortSignal,
): Promise<boolean> {
  if (await canViewApplication(db, actor, row.applicationId, signal)) return true
  return await isRemovalNoticeToFormerContractor(db, row)
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
    const actor = await loadActor(db, row.recipientUserId, signal)
    if (actor === null) {
      await drop(db, row.id, 'inactive_user')
      continue
    }
    if (!(await mayReceive(db, row, actor, signal))) {
      await drop(db, row.id, 'no_access')
      continue
    }
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.recipientUserId))
    if (user === undefined) {
      await drop(db, row.id, 'inactive_user')
      continue
    }
    const message = MESSAGES[row.event]({
      applicationId: row.applicationId,
      payload: row.payload as NotificationPayload,
    })
    const result = await deliver(mail, { to: user.email, ...message }, signal)
    if (result.ok) {
      await db
        .update(notificationOutbox)
        .set({ status: 'sent', sentAt: now, attempts: sql`${notificationOutbox.attempts} + 1` })
        .where(eq(notificationOutbox.id, row.id))
      sent += 1
      continue
    }
    const attempts = row.attempts + 1
    await db
      .update(notificationOutbox)
      .set({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued' })
      .where(and(eq(notificationOutbox.id, row.id)))
  }
  return sent
}
