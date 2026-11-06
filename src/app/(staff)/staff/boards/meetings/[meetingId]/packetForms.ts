import { z } from 'zod'
import { emailAddress, optionalWholeNumber, recordId, requiredText } from '@/features/input/schemas'
import { optionalRecordId, uuidList } from '../../formFields'

const packetId = () => recordId('a packet')

export const GATHER_PACKET_FORM = z.object({
  meetingId: recordId('a meeting'),
  documentId: uuidList(),
  trcApplicationId: uuidList(),
  share: optionalRecordId('a document'),
})

export const RENAME_PACKET_FORM = z.object({
  packetId: packetId(),
  title: requiredText('a title', { max: 200 }),
})

export const PACKET_ONLY_FORM = z.object({ packetId: packetId() })

export const SEND_OUTSIDE_FORM = z.object({
  packetId: packetId(),
  recipientName: requiredText('a name', { max: 200 }),
  recipientEmail: emailAddress('an email address'),
  days: optionalWholeNumber('the number of days', { min: 1, max: 30 }),
})

export const MEETING_ONLY_FORM = z.object({ meetingId: recordId('a meeting') })

export const RESEND_FORM = z.object({
  packetId: optionalRecordId('a packet'),
  userId: optionalRecordId('a member'),
  linkId: optionalRecordId('a link'),
})

export const TURN_OFF_LINK_FORM = z.object({ linkId: recordId('a link') })
