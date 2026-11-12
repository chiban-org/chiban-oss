import { env } from '@/config/env'
import type { MailMessage } from '@/features/mail/transport'
import {
  boardPacketValues,
  packetCancelValues,
  packetLinkValues,
  packetUpdateValues,
  type WordingPacket,
  wordingLink,
} from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { wordingFor } from '@/features/notifications/wording/wordingEdits'
import type { WordingKey } from '@/features/notifications/wording/wordingKeys'
import type { WordingOverrides } from '@/features/notifications/wording/wordingSchema'

export type MailPacket = WordingPacket

export interface PacketWording {
  overrides: WordingOverrides
  boardName?: string
  townName?: string
}

const NO_OVERRIDES: PacketWording = { overrides: {} }

const BOARD_URL = () => `${env.BASE_URL}/board`

function rendered(
  to: string,
  key: WordingKey,
  wording: PacketWording,
  values: Parameters<typeof renderWording>[1],
  href: string | null,
): MailMessage {
  const link = href === null ? null : wordingLink(key, href)
  const withTown =
    wording.townName === undefined ? values : { ...values, 'town.name': wording.townName }
  return { to, ...renderWording(wordingFor(key, wording.overrides), withTown, link) }
}

export function memberPacketMail(
  to: string,
  packet: MailPacket,
  wording: PacketWording = NO_OVERRIDES,
): MailMessage {
  return rendered(
    to,
    'board_packet_ready',
    wording,
    boardPacketValues(packet, wording.boardName),
    BOARD_URL(),
  )
}

export function linkPacketMail(
  to: { name: string; email: string },
  packet: MailPacket,
  link: { url: string; days: number },
  wording: PacketWording = NO_OVERRIDES,
): MailMessage {
  return rendered(
    to.email,
    'board_packet_link',
    wording,
    packetLinkValues(packet, to, link, wording.boardName),
    link.url,
  )
}

export function updatePacketMail(
  to: string,
  packet: MailPacket,
  input: { summary: string; viaLink: boolean },
  wording: PacketWording = NO_OVERRIDES,
): MailMessage {
  return rendered(
    to,
    'board_packet_updated',
    wording,
    packetUpdateValues(packet, input, wording.boardName),
    input.viaLink ? null : BOARD_URL(),
  )
}

export function cancelledPacketMail(
  to: string,
  packet: MailPacket,
  reason: string,
  wording: PacketWording = NO_OVERRIDES,
): MailMessage {
  return rendered(
    to,
    'board_meeting_cancelled',
    wording,
    packetCancelValues(packet, reason, wording.boardName),
    null,
  )
}
