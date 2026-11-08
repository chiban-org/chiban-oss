import { and, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { notificationOutbox, projectParties, users } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import { loadActor } from '@/features/auth/actor'
import { mintSystemClaim, type SystemClaimLink } from '@/features/contractors/systemClaim'
import type { NotificationPayload } from '@/features/notifications/queue'
import { isRemovalNoticeToFormerContractor } from '@/features/notifications/removedContractor'

export type OutboxRow = typeof notificationOutbox.$inferSelect

export type DropReason = 'no_access' | 'inactive_user' | 'claimed'

export type Delivery =
  | { kind: 'send'; to: string; claim?: SystemClaimLink }
  | { kind: 'drop'; reason: DropReason }

const drop = (reason: DropReason): Delivery => ({ kind: 'drop', reason })

export async function accountDelivery(
  db: DbOrTx,
  row: OutboxRow,
  userId: string,
  signal: AbortSignal,
): Promise<Delivery> {
  const actor = await loadActor(db, userId, signal)
  if (actor === null) return drop('inactive_user')
  const allowed =
    (await canViewApplication(db, actor, row.applicationId, signal)) ||
    (await isRemovalNoticeToFormerContractor(db, { ...row, recipientUserId: userId }))
  if (!allowed) return drop('no_access')
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
  return user === undefined ? drop('inactive_user') : { kind: 'send', to: user.email }
}

async function accountAlreadyQueued(db: DbOrTx, row: OutboxRow, userId: string): Promise<boolean> {
  const discriminator = (row.payload as NotificationPayload).discriminator ?? ''
  const found = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.event, row.event),
        eq(notificationOutbox.applicationId, row.applicationId),
        eq(notificationOutbox.recipientUserId, userId),
        sql`coalesce(${notificationOutbox.payload}->>'discriminator', '') = ${discriminator}`,
      ),
    )
    .limit(1)
  return found.length > 0
}

export async function partyDelivery(
  db: DbOrTx,
  row: OutboxRow,
  context: { partyId: string; now: Date; claimsDb: DbOrTx },
  signal: AbortSignal,
): Promise<Delivery> {
  const [party] = await db
    .select()
    .from(projectParties)
    .where(eq(projectParties.id, context.partyId))
  if (party === undefined || party.removedAt !== null) return drop('no_access')
  if (party.userId !== null) {
    if (await accountAlreadyQueued(db, row, party.userId)) return drop('claimed')
    return await accountDelivery(db, row, party.userId, signal)
  }
  if (party.email === null) return drop('no_access')
  const claim = await mintSystemClaim(
    context.claimsDb,
    { id: party.id, email: party.email },
    { applicationId: row.applicationId, now: context.now },
  )
  return claim === null ? drop('no_access') : { kind: 'send', to: party.email, claim }
}
