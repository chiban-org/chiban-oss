import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  applications,
  type NotificationEvent,
  notificationOutbox,
  projectParties,
} from '@/db/schema'

export interface NotificationPayload {
  number: string
  discriminator?: string
  amountCents?: number
  receiptNumber?: string
  assignmentId?: string
}

export interface QueueInput {
  event: NotificationEvent
  applicationId: string
  recipientUserIds: string[]
  discriminator?: string
  extra?: Partial<Omit<NotificationPayload, 'number' | 'discriminator'>>
}

const PARTY_ROLES = ['applicant', 'owner', 'agent'] as const

export async function partyRecipients(tx: Tx, applicationId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: projectParties.userId })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, applicationId),
        isNull(projectParties.removedAt),
        isNotNull(projectParties.userId),
        inArray(projectParties.role, [...PARTY_ROLES]),
      ),
    )
  return [...new Set(rows.flatMap((r) => (r.userId === null ? [] : [r.userId])))]
}

export async function queueNotification(
  tx: Tx,
  input: QueueInput,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  if (input.recipientUserIds.length === 0) return
  const [app] = await tx
    .select({ number: applications.number })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  if (app === undefined) return
  const payload: NotificationPayload = {
    number: app.number,
    ...(input.discriminator === undefined ? {} : { discriminator: input.discriminator }),
    ...input.extra,
  }
  await tx
    .insert(notificationOutbox)
    .values(
      [...new Set(input.recipientUserIds)].map((recipientUserId) => ({
        event: input.event,
        applicationId: input.applicationId,
        recipientUserId,
        payload,
      })),
    )
    .onConflictDoNothing()
}

export async function queueForParties(
  tx: Tx,
  input: Omit<QueueInput, 'recipientUserIds'>,
  signal: AbortSignal,
): Promise<void> {
  await queueNotification(
    tx,
    { ...input, recipientUserIds: await partyRecipients(tx, input.applicationId) },
    signal,
  )
}
