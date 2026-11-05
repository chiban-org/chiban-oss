import { env } from '@/config/env'
import type { MailMessage } from '@/features/mail/transport'
import { formatCivilDate } from '@/lib/formatDate'

export interface MailPacket {
  title: string
  meetingDate: string
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function message(to: string, subject: string, lines: string[]): MailMessage {
  return {
    to,
    subject,
    text: `${lines.join('\n\n')}\n`,
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
  }
}

function subjectOf(packet: MailPacket, prefix: string): string {
  return `${prefix}: ${packet.title}, meeting ${formatCivilDate(packet.meetingDate)}`
}

export function memberPacketMail(to: string, packet: MailPacket): MailMessage {
  const date = formatCivilDate(packet.meetingDate)
  return message(to, subjectOf(packet, 'Board packet'), [
    `Packet ready: sign in at ${env.BASE_URL}/board to read the packet for the ${date} meeting.`,
  ])
}

export function linkPacketMail(
  to: { name: string; email: string },
  packet: MailPacket,
  link: { url: string; days: number },
): MailMessage {
  const date = formatCivilDate(packet.meetingDate)
  return message(to.email, subjectOf(packet, 'Board packet'), [
    `${to.name}, the packet for the ${date} meeting is ready. The link expires in ${link.days} days.`,
    link.url,
  ])
}

export function updatePacketMail(
  to: string,
  packet: MailPacket,
  input: { summary: string; viaLink: boolean },
): MailMessage {
  const date = formatCivilDate(packet.meetingDate)
  const where = input.viaLink
    ? 'Open the packet from the link in your earlier email.'
    : `Sign in at ${env.BASE_URL}/board to read it.`
  return message(to, subjectOf(packet, 'Board packet updated'), [
    `The packet for the ${date} meeting changed. ${input.summary}`,
    where,
  ])
}

export function cancelledPacketMail(to: string, packet: MailPacket, reason: string): MailMessage {
  const date = formatCivilDate(packet.meetingDate)
  return message(to, subjectOf(packet, 'Meeting cancelled'), [
    `The ${date} meeting is cancelled: ${reason}. Its packet is closed and its links no longer work.`,
  ])
}
