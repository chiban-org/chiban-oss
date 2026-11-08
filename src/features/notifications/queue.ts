import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications, type NotificationEvent, notificationOutbox } from '@/db/schema'
import { type RecipientRole, resolveRecipients } from '@/features/notifications/recipients'

export interface NotificationPayload {
  number: string
  discriminator?: string
  amountCents?: number
  receiptNumber?: string
  assignmentId?: string
  inspectionLabel?: string
  onDate?: string
  atTime?: string
  result?: string
  revision?: number
  contractorRemoved?: boolean
  boardName?: string
  projectTitle?: string
  commentBy?: string
}

export interface QueueInput {
  event: NotificationEvent
  applicationId: string
  recipientUserIds: string[]
  recipientPartyIds?: string[]
  discriminator?: string
  extra?: Partial<Omit<NotificationPayload, 'number' | 'discriminator'>>
}

const PARTY_ROLES = ['applicant', 'owner', 'agent'] as const
export const INSPECTION_PARTY_ROLES = ['applicant', 'owner', 'agent', 'contractor'] as const

function recipientRows(
  input: QueueInput,
): { recipientUserId?: string; recipientPartyId?: string }[] {
  return [
    ...[...new Set(input.recipientUserIds)].map((recipientUserId) => ({ recipientUserId })),
    ...[...new Set(input.recipientPartyIds ?? [])].map((recipientPartyId) => ({
      recipientPartyId,
    })),
  ]
}

export async function queueNotification(
  tx: Tx,
  input: QueueInput,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const recipients = recipientRows(input)
  if (recipients.length === 0) return
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
      recipients.map((recipient) => ({
        event: input.event,
        applicationId: input.applicationId,
        payload,
        ...recipient,
      })),
    )
    .onConflictDoNothing()
}

export async function queueForParties(
  tx: Tx,
  input: Omit<QueueInput, 'recipientUserIds'> & { roles?: readonly RecipientRole[] },
  signal: AbortSignal,
): Promise<void> {
  const { roles, ...rest } = input
  const { userIds, partyIds } = await resolveRecipients(
    tx,
    input.applicationId,
    roles ?? PARTY_ROLES,
  )
  await queueNotification(
    tx,
    { ...rest, recipientUserIds: userIds, recipientPartyIds: partyIds },
    signal,
  )
}
