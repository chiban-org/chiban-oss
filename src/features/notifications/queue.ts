import { and, eq, inArray, isNotNull, isNull, notExists } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  applications,
  cutoverRows,
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

type RecipientRole = 'applicant' | 'owner' | 'agent' | 'contractor'

const CLAIMABLE_ROLES: readonly RecipientRole[] = ['applicant', 'contractor']

export async function partyRecipients(
  tx: Tx,
  applicationId: string,
  roles: readonly RecipientRole[] = PARTY_ROLES,
): Promise<string[]> {
  const rows = await tx
    .select({ userId: projectParties.userId })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, applicationId),
        isNull(projectParties.removedAt),
        isNotNull(projectParties.userId),
        inArray(projectParties.role, [...roles]),
      ),
    )
  return [...new Set(rows.flatMap((r) => (r.userId === null ? [] : [r.userId])))]
}

export async function addressRecipients(
  tx: Tx,
  applicationId: string,
  roles: readonly RecipientRole[] = PARTY_ROLES,
): Promise<string[]> {
  const claimable = roles.filter((r) => CLAIMABLE_ROLES.includes(r))
  if (claimable.length === 0) return []
  const rows = await tx
    .select({ partyId: projectParties.id })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, applicationId),
        isNull(projectParties.removedAt),
        isNull(projectParties.userId),
        isNotNull(projectParties.email),
        inArray(projectParties.role, claimable),
        notExists(
          tx
            .select({ id: cutoverRows.applicationId })
            .from(cutoverRows)
            .where(eq(cutoverRows.applicationId, applications.id)),
        ),
      ),
    )
  return rows.map((r) => r.partyId)
}

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
  const [recipientUserIds, recipientPartyIds] = await Promise.all([
    partyRecipients(tx, input.applicationId, roles),
    addressRecipients(tx, input.applicationId, roles),
  ])
  await queueNotification(tx, { ...rest, recipientUserIds, recipientPartyIds }, signal)
}
