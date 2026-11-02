'use server'

import { revalidatePath } from 'next/cache'
import { revokePacketLink, sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { getMailTransport } from '@/features/mail/transport'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { parseCivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

const invalid = (): ActionResult => ({ ok: false, error: errorCopy('invalid_input') })
const SEND_COPY = {
  forbidden: errorCopy('forbidden'),
  expiry_too_long: 'A link can last at most 30 days.',
  not_found: errorCopy('not_found'),
  send_failed: 'The email could not be sent. Try again.',
} as const

export async function createPacketAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const board = text(formData, 'board')
    const date = parseCivilDate(text(formData, 'meetingDate'))
    const documentIds = formData
      .getAll('documentId')
      .filter((v): v is string => typeof v === 'string' && isUuid(v))
    if ((board !== 'planning_board' && board !== 'zba') || !date.ok || documentIds.length === 0) {
      return invalid()
    }
    const made = await createPacket(
      db,
      actor,
      { title: text(formData, 'title'), board, meetingDate: date.value, documentIds },
      signal,
    )
    if (made.ok) {
      revalidatePath('/staff/boards/packets')
      return { ok: true, message: 'Packet created.' }
    }
    if (made.error === 'forbidden') return { ok: false, error: errorCopy('forbidden') }
    return { ok: false, error: 'Some documents are not shared with the board and are not public.' }
  })
}

export async function sendPacketLinkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const packetId = text(formData, 'packetId')
    const days = text(formData, 'days')
    if (!isUuid(packetId) || text(formData, 'recipientEmail') === '') return invalid()
    const sent = await sendPacketLink(
      db,
      getMailTransport(),
      actor,
      {
        packetId,
        recipientName: text(formData, 'recipientName'),
        recipientEmail: text(formData, 'recipientEmail'),
        ...(days === '' ? {} : { expiresInDays: Number(days) }),
      },
      signal,
    )
    if (!sent.ok) return { ok: false, error: SEND_COPY[sent.error] }
    revalidatePath('/staff/boards/packets')
    return {
      ok: true,
      message: sent.value.viaAccount
        ? 'Board member notified. They read the packet on their board page, so there is no link to expire or revoke.'
        : 'Link sent.',
    }
  })
}

export async function revokePacketLinkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const linkId = text(formData, 'linkId')
    if (!isUuid(linkId)) return invalid()
    const revoked = await revokePacketLink(db, actor, { linkId }, signal)
    return revoked.ok
      ? { ok: true, message: 'Link revoked.' }
      : { ok: false, error: errorCopy(revoked.error) }
  })
}
