'use server'

import { revokePacketLink, sendPacketLink } from '@/features/boards/packetLinks'
import { notForBoardMessage } from '@/features/boards/packetRefusal'
import { renamePacket, savePacket, shareWithBoard } from '@/features/boards/packetSave'
import { resendToLink, resendToMember, sendPacketToBoard } from '@/features/boards/packetSend'
import { replacePacketAgenda, sendPacketUpdate } from '@/features/boards/packetUpdate'
import { getMailTransport } from '@/features/mail/transport'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const PACKET_COPY: Record<string, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  meeting_cancelled: 'The meeting is cancelled, so its packet is closed.',
  agenda_not_published: 'Publish the agenda before preparing the packet.',
  empty: 'Check at least one document to save the packet.',
  no_members: 'The board has no seated members to send to.',
  already_sent: 'Every seated member already has the packet.',
  send_failed: 'The email could not be sent. Try again.',
  expiry_too_long: 'A link can last from 1 to 30 days.',
  member_of_board:
    'This person is a seated member of the board. Send the packet to the board instead.',
  not_sent: 'Send the packet before sending an update.',
  no_changes: 'There are no changes to send.',
  nothing_to_replace: 'The packet already has the current agenda.',
  title_required: 'Enter a title.',
  invalid_audience: errorCopy('invalid_input'),
}

function failed(error: unknown): ActionResult {
  return { ok: false, error: PACKET_COPY[String(error)] ?? errorCopy('invalid_input') }
}

function ids(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((v): v is string => typeof v === 'string' && isUuid(v))
}

export async function gatherPacketAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const share = text(formData, 'share')
    if (share !== '') {
      if (!isUuid(share)) return failed('not_found')
      const shared = await shareWithBoard(db, actor, { documentId: share }, signal)
      return shared.ok
        ? { ok: true, message: 'Shared with the board. Check it to add it to the packet.' }
        : failed(shared.error)
    }
    const saved = await savePacket(
      db,
      getObjectStore(),
      actor,
      {
        meetingId: text(formData, 'meetingId'),
        documentIds: ids(formData, 'documentId'),
        trcApplicationIds: ids(formData, 'trcApplicationId'),
      },
      signal,
    )
    if (saved.ok) return { ok: true, message: 'Packet saved.' }
    if (typeof saved.error === 'object') {
      return { ok: false, error: await notForBoardMessage(db, saved.error.notForBoard, signal) }
    }
    return failed(saved.error)
  })
}

export async function renamePacketAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const renamed = await renamePacket(
      db,
      actor,
      { packetId: text(formData, 'packetId'), title: text(formData, 'title') },
      signal,
    )
    return renamed.ok ? { ok: true, message: 'Title saved.' } : failed(renamed.error)
  })
}

export async function sendToBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const sent = await sendPacketToBoard(
      db,
      getMailTransport(),
      actor,
      { packetId: text(formData, 'packetId') },
      signal,
    )
    return sent.ok
      ? { ok: true, message: `Sent to ${sent.value.sent} members.` }
      : failed(sent.error)
  })
}

export async function sendOutsideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const days = text(formData, 'days')
    const sent = await sendPacketLink(
      db,
      getMailTransport(),
      actor,
      {
        packetId: text(formData, 'packetId'),
        recipientName: text(formData, 'recipientName'),
        recipientEmail: text(formData, 'recipientEmail'),
        ...(days === '' ? {} : { expiresInDays: Number(days) }),
      },
      signal,
    )
    return sent.ok ? { ok: true, message: 'Private link sent.' } : failed(sent.error)
  })
}

export async function sendUpdateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const sent = await sendPacketUpdate(
      db,
      getMailTransport(),
      actor,
      { packetId: text(formData, 'packetId') },
      signal,
    )
    return sent.ok
      ? { ok: true, message: `Update sent to ${sent.value.recipients} recipients.` }
      : failed(sent.error)
  })
}

export async function replaceAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const replaced = await replacePacketAgenda(
      db,
      actor,
      { meetingId: text(formData, 'meetingId') },
      signal,
    )
    return replaced.ok
      ? { ok: true, message: 'Agenda replaced. Send the update to tell recipients.' }
      : failed(replaced.error)
  })
}

export async function resendAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const linkId = text(formData, 'linkId')
    const sent =
      linkId === ''
        ? await resendToMember(
            db,
            getMailTransport(),
            actor,
            { packetId: text(formData, 'packetId'), userId: text(formData, 'userId') },
            signal,
          )
        : await resendToLink(db, getMailTransport(), actor, { linkId }, signal)
    return sent.ok ? { ok: true, message: 'Sent again.' } : failed(sent.error)
  })
}

export async function turnOffLinkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const turnedOff = await revokePacketLink(
      db,
      actor,
      { linkId: text(formData, 'linkId') },
      signal,
    )
    return turnedOff.ok ? { ok: true, message: 'Link turned off.' } : failed(turnedOff.error)
  })
}
