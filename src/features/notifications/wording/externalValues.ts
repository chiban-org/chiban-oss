import { meetingWhenAndWhere } from '@/features/boards/meetingWhen'
import type { WordingLink } from '@/features/notifications/wording/renderWording'
import type { WordingValues } from '@/features/notifications/wording/wordingFields'
import { WORDING_KEY_INFO, type WordingKey } from '@/features/notifications/wording/wordingKeys'
import { formatCivilDate } from '@/lib/formatDate'

export interface WordingPacket {
  title: string
  meetingDate: string
  place?: { startsAtMinute: number; location: string } | null
}

const NAMED_AS = {
  contractor: 'as a contractor on a project',
  applicant: 'as the applicant on an application',
} as const

export function wordingLink(key: WordingKey, href: string): WordingLink {
  return { href, label: WORDING_KEY_INFO[key].linkLabel ?? href }
}

function packetTitleOf(packet: WordingPacket): string {
  const date = formatCivilDate(packet.meetingDate)
  return packet.title.includes(date) ? packet.title : `${packet.title}, meeting ${date}`
}

function meetingWhenOf(packet: WordingPacket): string {
  const place = packet.place ?? null
  return place === null
    ? formatCivilDate(packet.meetingDate)
    : meetingWhenAndWhere({ meetingDate: packet.meetingDate, ...place })
}

export function boardPacketValues(packet: WordingPacket, boardName?: string): WordingValues {
  return {
    ...(boardName === undefined ? {} : { 'board.name': boardName }),
    'packet.title': packetTitleOf(packet),
    'meeting.date': formatCivilDate(packet.meetingDate),
    'meeting.when': meetingWhenOf(packet),
  }
}

export function packetLinkValues(
  packet: WordingPacket,
  to: { name: string },
  link: { days: number },
  boardName?: string,
): WordingValues {
  return {
    ...boardPacketValues(packet, boardName),
    'recipient.name': to.name,
    'link.days': String(link.days),
  }
}

export const PACKET_WHERE_SIGN_IN = 'Sign in to read it.'
export const PACKET_WHERE_VIA_LINK = 'Open the packet from the link in your earlier email.'

export function packetUpdateValues(
  packet: WordingPacket,
  input: { summary: string; viaLink: boolean },
  boardName?: string,
): WordingValues {
  return {
    ...boardPacketValues(packet, boardName),
    'packet.changes': input.summary,
    'packet.where': input.viaLink ? PACKET_WHERE_VIA_LINK : PACKET_WHERE_SIGN_IN,
  }
}

export function packetCancelValues(
  packet: WordingPacket,
  reason: string,
  boardName?: string,
): WordingValues {
  return { ...boardPacketValues(packet, boardName), 'meeting.reason': reason }
}

export function boardMemberValues(input: { boardName: string; titleLabel: string }): WordingValues {
  return { 'board.name': input.boardName, 'member.title': input.titleLabel.toLowerCase() }
}

export function claimValues(input: {
  name: string
  role: keyof typeof NAMED_AS
  title: string
  days: number
  townName: string
}): WordingValues {
  return {
    'recipient.name': input.name,
    'claim.namedAs': NAMED_AS[input.role],
    'project.title': input.title,
    'link.days': String(input.days),
    'town.name': input.townName,
  }
}

export function requestReceiptValues(receipt: {
  number: string
  receivedOn: string
  due: string
}): WordingValues {
  return {
    'request.number': receipt.number,
    'request.receivedOn': formatCivilDate(receipt.receivedOn),
    'request.due': formatCivilDate(receipt.due),
  }
}

export function requestLetterValues(number: string): WordingValues {
  return { 'request.number': number }
}

function linkNoteOf(message: { tooLarge?: boolean; reissued?: boolean }): string {
  if (message.reissued === true) return ' The earlier link has expired, so here is a new one.'
  return message.tooLarge === true
    ? ' The files were too large to attach to an email, so they are at this link instead.'
    : ''
}

export function releaseValues(
  message: { number: string; releasedOn: string; tooLarge?: boolean; reissued?: boolean },
  linkDays: number,
): WordingValues {
  return {
    'request.number': message.number,
    'records.releasedOn': formatCivilDate(message.releasedOn),
    'records.linkNote': linkNoteOf(message),
    'link.days': String(linkDays),
  }
}
