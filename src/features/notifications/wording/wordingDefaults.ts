import type { WordingKey } from '@/features/notifications/wording/wordingKeys'

export interface Wording {
  subject: string
  body: string
}

const NUMBER = '{{application.number}}'
const INSPECTION_LABEL = '{{inspection.type}}'
const DETAILS = 'Open the application for the details.'

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
}
