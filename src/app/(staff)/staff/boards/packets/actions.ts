'use server'

import { revalidatePath } from 'next/cache'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { revokePacketLink, sendPacketLink } from '@/features/boards/packetLinks'
import { notForBoardMessage } from '@/features/boards/packetRefusal'
import { createPacket } from '@/features/boards/packets'
import { getMailTransport } from '@/features/mail/transport'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
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
    const meetingId = text(formData, 'meetingId')
    const documentIds = formData
      .getAll('documentId')
      .filter((v): v is string => typeof v === 'string' && isUuid(v))
    if (!isUuid(meetingId) || documentIds.length === 0) return invalid()
    const made = await createPacket(
      db,
      actor,
      { title: text(formData, 'title'), meetingId, documentIds },
      signal,
    )
    if (made.ok) {
      revalidatePath('/staff/boards/packets')
      return { ok: true, message: 'Packet created.' }
    }
    if (typeof made.error === 'string') return { ok: false, error: boardErrorCopy(made.error) }
    return { ok: false, error: await notForBoardMessage(db, made.error.notForBoard, signal) }
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
