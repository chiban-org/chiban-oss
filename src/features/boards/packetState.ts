import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface PacketStateInput {
  cancelled: boolean
  agendaPublished: boolean
  hasPacket: boolean
  sentOn: CivilDate | null
  pending: number
  members: number
  outside: number
}

export type PacketStateKind = 'cancelled' | 'no_agenda' | 'draft' | 'changed' | 'sent'

export interface PacketState {
  kind: PacketStateKind
  label: string
  needsWork: boolean
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function sentLabel(input: PacketStateInput, sentOn: CivilDate): string {
  const who =
    input.members > 0 || input.outside === 0
      ? plural(input.members, 'member', 'members')
      : `${plural(input.outside, 'person', 'people')} outside the board`
  return `Sent to ${who} on ${formatCivilDate(sentOn)}`
}

function kindOf(input: PacketStateInput): PacketStateKind {
  if (input.cancelled) return 'cancelled'
  if (!input.hasPacket && !input.agendaPublished) return 'no_agenda'
  if (input.sentOn === null) return 'draft'
  return input.pending > 0 ? 'changed' : 'sent'
}

const FIXED_LABELS = {
  cancelled: 'Meeting cancelled. Packet closed.',
  no_agenda: 'Publish the agenda to start the packet',
  draft: 'Not sent yet',
} as const

export function packetStateOf(input: PacketStateInput): PacketState {
  const kind = kindOf(input)
  const label =
    kind === 'changed'
      ? `${plural(input.pending, 'change', 'changes')} not sent yet`
      : kind === 'sent' && input.sentOn !== null
        ? sentLabel(input, input.sentOn)
        : FIXED_LABELS[kind as keyof typeof FIXED_LABELS]
  return { kind, label, needsWork: kind === 'draft' || kind === 'changed' }
}
