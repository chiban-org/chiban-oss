import { RECIPIENT_ROLES } from '@packs/nh/schema'
import { z } from 'zod'
import { COURT_STEP_KINDS, JUDGMENT_OUTCOMES, SERVER_ROLES, SERVICE_METHODS } from '@/db/schema'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import { choice, civilDate, optionalText, recordId, requiredText } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { optionalChoice, requiredRecordId } from './inputFields'

export const ROLE_CHECK_OUTCOMES = [
  'recipients_listed',
  'none_exist',
  'same_as_owner',
  'owner_not_found',
] as const

export const COURT_DOCUMENT_MESSAGE =
  'Choose the court document. Upload it in the Documents section first, as a court document.'

export const COURT_STEP_DOCUMENT_MESSAGE =
  'Choose the court document. Upload it above the form if it is not listed.'

export const LIST_RECIPIENT_FORM = z.object({
  orderId: recordId('an order'),
  role: choice('a role', RECIPIENT_ROLES),
  name: requiredText('a name', { max: 200 }),
  address: requiredText('an address', { max: 500 }),
  source: requiredText('where the name came from', { max: 300 }),
})

export const roleCheckForm = (today: CivilDate) =>
  z.object({
    orderId: recordId('an order'),
    role: choice('a role', RECIPIENT_ROLES),
    outcome: choice('a result', ROLE_CHECK_OUTCOMES),
    basis: requiredText('what was searched', { max: 500 }),
    checkedOn: civilDate('the date checked', { latest: today }),
  })

export const SERVICE_EVENT_FORM = z.object({
  orderId: recordId('an order'),
  recipientId: optionalRecordId('Choose who was served.'),
  method: choice('a method', SERVICE_METHODS),
  servedOn: civilDate('the date served'),
  serverName: optionalText('the name of the server', { max: 200 }),
  serverRole: optionalChoice('what the server is', SERVER_ROLES),
  newspaper: optionalText('the newspaper', { max: 200 }),
  proofDocumentId: optionalRecordId('Choose the proof of service.'),
})

export const answerForm = (today: CivilDate) =>
  z.object({
    recipientId: requiredRecordId('Choose who answered.'),
    answeredOn: civilDate('the date the answer was received', { latest: today }),
    documentId: requiredRecordId(
      'Choose the answer document. Upload it above the form if it is not listed.',
    ),
  })

export const COURT_STEP_FORM = z
  .object({
    orderId: recordId('an order'),
    kind: choice('a step', COURT_STEP_KINDS),
    occurredOn: civilDate('the date of the step'),
    court: requiredText('the court', { max: 200 }),
    docket: optionalText('the docket number', { max: 100 }),
    documentId: requiredRecordId(COURT_STEP_DOCUMENT_MESSAGE),
    judgmentOutcome: optionalChoice('a judgment result', JUDGMENT_OUTCOMES),
  })
  .superRefine((value, ctx) => {
    const judgment = value.kind === 'judgment'
    if (judgment && value.judgmentOutcome === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['judgmentOutcome'],
        message: 'Choose the judgment result.',
      })
    }
    if (!judgment && value.judgmentOutcome !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['judgmentOutcome'],
        message: 'Choose Not a judgment unless this step is a judgment.',
      })
    }
  })
