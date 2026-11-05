import type { Tx } from '@/db/client'
import { queueNotification } from '@/features/notifications/queue'
import type { ContractorPlan, PartyRow } from '@/features/permits/correction/contractor'

export interface Recipient {
  userId: string
  name: string
  removed: boolean
}

export function correctionRecipients(parties: PartyRow[], plan: ContractorPlan): Recipient[] {
  const removedIds = new Set(plan.removed.map((p) => p.id))
  const staying = [
    ...parties.filter((p) => !removedIds.has(p.id)),
    ...(plan.added === null ? [] : [plan.added]),
  ]
  const out = new Map<string, Recipient>()
  for (const party of staying) {
    if (party.userId !== null && !out.has(party.userId)) {
      out.set(party.userId, { userId: party.userId, name: party.name, removed: false })
    }
  }
  for (const party of plan.removed) {
    if (party.userId !== null && !out.has(party.userId)) {
      out.set(party.userId, { userId: party.userId, name: party.name, removed: true })
    }
  }
  return [...out.values()]
}

export function recipientLabel(recipient: Recipient): string {
  return recipient.removed ? `${recipient.name} (no longer the contractor)` : recipient.name
}

export async function notifyCorrection(
  tx: Tx,
  applicationId: string,
  sent: { recipients: Recipient[]; revision: number },
  signal: AbortSignal,
): Promise<void> {
  const { recipients, revision } = sent
  const ids = (removed: boolean) =>
    recipients.filter((r) => r.removed === removed).map((r) => r.userId)
  await queueNotification(
    tx,
    {
      event: 'permit_corrected',
      applicationId,
      recipientUserIds: ids(false),
      discriminator: `revision-${revision}`,
      extra: { revision },
    },
    signal,
  )
  await queueNotification(
    tx,
    {
      event: 'permit_corrected',
      applicationId,
      recipientUserIds: ids(true),
      discriminator: `revision-${revision}-removed`,
      extra: { revision, contractorRemoved: true },
    },
    signal,
  )
}
