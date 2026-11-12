import type { WordingKey } from '@/features/notifications/wording/wordingKeys'

export interface Wording {
  subject: string
  body: string
}

const NUMBER = '{{application.number}}'
const INSPECTION_LABEL = '{{inspection.type}}'
const DETAILS = 'Open the application for the details.'
const REQUEST = '{{request.number}}'
const RELEASED = `The town released records for your Right-to-Know request ${REQUEST} on {{records.releasedOn}}.`

export const DEFAULT_WORDING: Record<WordingKey, Wording> = {
  application_submitted: {
    subject: `Application ${NUMBER} received`,
    body: `The {{town.name}} received application ${NUMBER}.`,
  },
  fees_due: {
    subject: `Fees due for ${NUMBER}: {{fees.amount}}`,
    body: `Application ${NUMBER} has fees due: {{fees.amount}}. You can pay online.`,
  },
  payment_received: {
    subject: 'Payment received, receipt {{receipt.number}}',
    body: `The town received a payment for application ${NUMBER}.`,
  },
  application_issued: {
    subject: `Permit ${NUMBER} issued`,
    body: `Permit ${NUMBER} was issued. You can download it {{account.from}}.`,
  },
  application_denied: {
    subject: `Application ${NUMBER} denied`,
    body: `Application ${NUMBER} was denied. ${DETAILS}`,
  },
  inspection_scheduled: {
    subject: `Inspection scheduled: ${NUMBER}, ${INSPECTION_LABEL} on {{inspection.date}} at {{inspection.time}}`,
    body: `An inspection for ${NUMBER} is scheduled for {{inspection.date}} at {{inspection.time}}. Someone should be at the site.`,
  },
  inspection_cancelled: {
    subject: `Inspection cancelled: ${NUMBER}, ${INSPECTION_LABEL}`,
    body: `The ${INSPECTION_LABEL} inspection for ${NUMBER} was cancelled. ${DETAILS}`,
  },
  inspection_result: {
    subject: `Inspection {{inspection.result}}: ${NUMBER}, ${INSPECTION_LABEL}`,
    body: `The ${INSPECTION_LABEL} inspection for ${NUMBER} {{inspection.result}}. ${DETAILS}`,
  },
  permit_corrected: {
    subject: `Permit ${NUMBER} corrected`,
    body: `Permit ${NUMBER} was corrected and reissued as revision {{permit.revision}}. The corrected permit is {{account.in}}; the earlier copy stays listed under it.`,
  },
  permit_corrected_contractor_removed: {
    subject: `Permit ${NUMBER} corrected`,
    body: `Permit ${NUMBER} was corrected and reissued as revision {{permit.revision}}. You are no longer listed as its contractor.`,
  },
  review_assigned: {
    subject: `Review requested: ${NUMBER}`,
    body: `You were asked to review application ${NUMBER}.`,
  },
  board_comment_requested: {
    subject: `Comments requested: ${NUMBER}, {{project.title}}`,
    body: [
      `The land use office asks the {{board.name}} for comments on application ${NUMBER}, {{project.title}}.`,
      'Comments by {{comments.by}}.',
      'Sign in at {{link}} to read the application and comment.',
    ].join('\n\n'),
  },
  clock_due_soon: {
    subject: `Deadline coming up: ${NUMBER}, {{clock.name}}, due {{clock.due}}`,
    body: `{{clock.name}} for application ${NUMBER}: due {{clock.due}}. Open the application to act before it passes.`,
  },
  clock_overdue: {
    subject: `Deadline passed: ${NUMBER}, {{clock.name}}`,
    body: `{{clock.name}} for application ${NUMBER}: it was due {{clock.due}} and has passed. Open the application to act on it or record an extension.`,
  },
  decision_filed: {
    subject: `Decision filed: ${NUMBER}, {{decision.outcome}}`,
    body: [
      `The {{board.name}} decision on application ${NUMBER} was filed with the town on {{decision.filedOn}}. The decision: {{decision.outcome}}.`,
      'The decision letter is attached to the application. You can read and print it {{account.from}}.',
    ].join('\n\n'),
  },
  board_member_added: {
    subject: 'Board membership: {{board.name}}',
    body: 'You have been added to the {{board.name}} as {{member.title}}. Sign in with your email address at {{link}} to read meeting packets. We will email you a one-time sign-in link when you ask for it.',
  },
  board_packet_ready: {
    subject: 'Board packet: {{packet.title}}',
    body: [
      'The packet for the meeting on {{meeting.when}} is ready.',
      'Sign in at {{link}} to read it.',
    ].join('\n\n'),
  },
  board_packet_link: {
    subject: 'Board packet: {{packet.title}}',
    body: '{{recipient.name}}, the packet for the meeting on {{meeting.when}} is ready. The link expires in {{link.days}} days.',
  },
  board_packet_updated: {
    subject: 'Board packet updated: {{packet.title}}',
    body: [
      'The packet for the {{meeting.date}} meeting changed. {{packet.changes}}',
      '{{packet.where}}',
    ].join('\n\n'),
  },
  board_meeting_cancelled: {
    subject: 'Meeting cancelled: {{packet.title}}',
    body: 'The {{meeting.date}} meeting is cancelled: {{meeting.reason}}. Its packet is closed and its links no longer work.',
  },
  project_claim: {
    subject: 'Claim your project in Chiban: {{project.title}}',
    body: [
      '{{recipient.name}}, you were named {{claim.namedAs}} at the {{town.name}}.',
      'Use this link to claim the project and follow its permits. It works once and expires in {{link.days}} days.',
    ].join('\n\n'),
  },
  rtk_request_received: {
    subject: `Right-to-Know request ${REQUEST} received`,
    body: [
      `The town received your Right-to-Know request on {{request.receivedOn}}. Its number is ${REQUEST}.`,
      'The town will answer by {{request.due}}. It will make the records available, deny the request in writing, or tell you in writing when it will answer.',
      'Keep the request number if you need to ask about it.',
    ].join('\n\n'),
  },
  rtk_letter_sent: {
    subject: `Letter about Right-to-Know request ${REQUEST}`,
    body: `The town's letter about your Right-to-Know request ${REQUEST} is attached.`,
  },
  rtk_records_link: {
    subject: `Records for request ${REQUEST}`,
    body: `${RELEASED}{{records.linkNote}} The link works for {{link.days}} days.`,
  },
  rtk_records_attached: {
    subject: `Records for request ${REQUEST}`,
    body: `${RELEASED} The records and the town's letter are attached.`,
  },
}
