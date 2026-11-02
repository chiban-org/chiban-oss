import type { ChannelHint, Recipient } from '@/features/abutters/resolution'

const PUNCTUATION = /[^A-Z0-9\s]/g
const WHITESPACE = /\s+/g

function normalize(text: string): string {
  return text.toUpperCase().replace(PUNCTUATION, ' ').replace(WHITESPACE, ' ').trim()
}

export function dedupeKey(name: string, address: string): string {
  return `${normalize(name)}|${normalize(address)}`
}

const CHANNEL_STRENGTH: Record<ChannelHint, number> = {
  first_class_mail: 0,
  verified_mail: 1,
  certified_mail: 2,
}

function union<T>(first: T[], second: T[]): T[] {
  return [...new Set([...first, ...second])]
}

function mergeTwo(held: Recipient, next: Recipient): Recipient {
  return {
    ...held,
    roles: union(held.roles, next.roles),
    parcelIds: union(held.parcelIds, next.parcelIds),
    provenance: [...held.provenance, ...next.provenance],
    channelHint:
      CHANNEL_STRENGTH[next.channelHint] > CHANNEL_STRENGTH[held.channelHint]
        ? next.channelHint
        : held.channelHint,
    status:
      held.status === 'needs_decision' || next.status === 'needs_decision'
        ? 'needs_decision'
        : held.status === 'incomplete_data'
          ? next.status
          : held.status,
  }
}

export function mergeRecipients(recipients: Recipient[]): Recipient[] {
  const merged = new Map<string, Recipient>()
  const unmerged: Recipient[] = []
  const order: (string | number)[] = []
  for (const recipient of recipients) {
    if (recipient.mailingAddress === null) {
      order.push(unmerged.length)
      unmerged.push(recipient)
      continue
    }
    const key = dedupeKey(recipient.name, recipient.mailingAddress)
    const held = merged.get(key)
    if (held === undefined) order.push(key)
    merged.set(key, held === undefined ? { ...recipient, key } : mergeTwo(held, recipient))
  }
  return order.map(
    (slot) => (typeof slot === 'number' ? unmerged[slot] : merged.get(slot)) as Recipient,
  )
}
