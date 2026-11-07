'use server'

import { revokePacketLink, sendPacketLink } from '@/features/boards/packetLinks'
import { notForBoardMessage } from '@/features/boards/packetRefusal'
import { renamePacket, savePacket, shareWithBoard } from '@/features/boards/packetSave'
import { resendToLink, resendToMember, sendPacketToBoard } from '@/features/boards/packetSend'
import { replacePacketAgenda, sendPacketUpdate } from '@/features/boards/packetUpdate'
import { getMailTransport } from '@/features/mail/transport'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import {
  GATHER_PACKET_FORM,
  MEETING_ONLY_FORM,
  PACKET_ONLY_FORM,
  RENAME_PACKET_FORM,
  RESEND_FORM,
  SEND_OUTSIDE_FORM,
  TURN_OFF_LINK_FORM,
} from './packetForms'

const PACKET_COPY: Record<string, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  meeting_cancelled: 'The meeting is cancelled, so its packet is closed.',
  agenda_not_published: 'Show the agenda on the public site before preparing the packet.',
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

function failed(error: unknown, fieldOf: Record<string, string> = {}): ActionResult {
  const copy = PACKET_COPY[String(error)] ?? errorCopy('invalid_input')
  const field = fieldOf[String(error)]
  return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
}

export async function gatherPacketAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, GATHER_PACKET_FORM, async ({ db, actor, signal }, input) => {
    if (input.share !== null) {
      const shared = await shareWithBoard(db, actor, { documentId: input.share }, signal)
      return shared.ok
        ? { ok: true, message: 'Shared with the board. Check it to add it to the packet.' }
        : failed(shared.error)
    }
    const saved = await savePacket(
      db,
      getObjectStore(),
      actor,
      {
        meetingId: input.meetingId,
        documentIds: input.documentId,
        trcApplicationIds: input.trcApplicationId,
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
  return await runStaffForm(formData, RENAME_PACKET_FORM, async ({ db, actor, signal }, input) => {
    const renamed = await renamePacket(db, actor, input, signal)
    return renamed.ok
      ? { ok: true, message: 'Title saved.' }
      : failed(renamed.error, { title_required: 'title' })
  })
}

export async function sendToBoardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PACKET_ONLY_FORM, async ({ db, actor, signal }, input) => {
    const sent = await sendPacketToBoard(db, getMailTransport(), actor, input, signal)
    return sent.ok
      ? { ok: true, message: `Sent to ${sent.value.sent} members.` }
      : failed(sent.error)
  })
}

export async function sendOutsideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SEND_OUTSIDE_FORM, async ({ db, actor, signal }, input) => {
    const { days, ...rest } = input
    const sent = await sendPacketLink(
      db,
      getMailTransport(),
      actor,
      { ...rest, ...(days === null ? {} : { expiresInDays: days }) },
      signal,
    )
    return sent.ok
      ? { ok: true, message: 'Private link sent.' }
      : failed(sent.error, { member_of_board: 'recipientEmail', expiry_too_long: 'days' })
  })
}

export async function sendUpdateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PACKET_ONLY_FORM, async ({ db, actor, signal }, input) => {
    const sent = await sendPacketUpdate(db, getMailTransport(), actor, input, signal)
    return sent.ok
      ? { ok: true, message: `Update sent to ${sent.value.recipients} recipients.` }
      : failed(sent.error)
  })
}

export async function replaceAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MEETING_ONLY_FORM, async ({ db, actor, signal }, input) => {
    const replaced = await replacePacketAgenda(db, actor, input, signal)
    return replaced.ok
      ? { ok: true, message: 'Agenda replaced. Send the update to tell recipients.' }
      : failed(replaced.error)
  })
}

export async function resendAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RESEND_FORM, async ({ db, actor, signal }, input) => {
    const { packetId, userId, linkId } = input
    if (linkId === null && packetId === null) return refuseField('packetId', 'Choose a packet.')
    if (linkId === null && userId === null) return refuseField('userId', 'Choose a member.')
    const sent =
      linkId !== null
        ? await resendToLink(db, getMailTransport(), actor, { linkId }, signal)
        : await resendToMember(
            db,
            getMailTransport(),
            actor,
            { packetId: packetId ?? '', userId: userId ?? '' },
            signal,
          )
    return sent.ok ? { ok: true, message: 'Sent again.' } : failed(sent.error)
  })
}

export async function turnOffLinkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, TURN_OFF_LINK_FORM, async ({ db, actor, signal }, input) => {
    const turnedOff = await revokePacketLink(db, actor, input, signal)
    return turnedOff.ok ? { ok: true, message: 'Link turned off.' } : failed(turnedOff.error)
  })
}
