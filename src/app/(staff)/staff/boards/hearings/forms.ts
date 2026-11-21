import { z } from 'zod'
import { parseConditions, parseVotes } from '@/features/decisions/formParsing'
import {
  checkbox,
  choice,
  civilDate,
  inputField,
  optionalText,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import { PROOF_METHODS } from '@/features/notices/proofMethods'
import { DECISION_OUTCOMES, DELIVERY_METHODS } from '@/features/packs/schema'
import { err, ok } from '@/types/result'
import { optionalRecordId, valueList } from '../formFields'

const APPEAL_KINDS = [
  'zba_appeal',
  'rehearing_motion',
  'rehearing_outcome',
  'court_petition',
  'zba_decision',
] as const

const hearingId = () => recordId('a hearing')
const meetingId = () => recordId('a meeting')
const decisionId = () => recordId('a decision')
const itemId = () => recordId('an agenda item')

export const SCHEDULE_HEARING_FORM = z.object({
  applicationId: recordId('an application'),
  meetingId: meetingId(),
  kind: choice('a kind of hearing', [
    'submission_and_hearing',
    'public_hearing',
    'rehearing',
  ] as const),
})

export const RECORD_PROOF_FORM = z.object({
  itemIds: valueList(),
  method: choice('a method of notice', PROOF_METHODS),
  reference: optionalText('the tracking number', { max: 200 }),
  effectiveOn: civilDate('the date of the proof'),
  documentId: recordId('the certificate or receipt'),
})

export const HEARING_ONLY_FORM = z.object({ hearingId: hearingId() })

export const CONTINUE_HEARING_FORM = z.object({
  hearingId: hearingId(),
  toMeetingId: recordId('the new meeting'),
  announced: choice('whether it was announced', ['yes', 'no'] as const),
  details: optionalText('what was announced', { max: 1000 }),
})

export const MARK_HELD_FORM = z.object({
  hearingId: hearingId(),
  heldOn: civilDate('the date the hearing was held'),
})

export const MEETING_ONLY_FORM = z.object({ meetingId: meetingId() })

export const ADD_AGENDA_ITEM_FORM = z.object({
  meetingId: meetingId(),
  kind: choice('a kind of item', ['hearing', 'business', 'minutes_approval', 'other'] as const),
  title: requiredText('a title', { max: 200 }),
  description: optionalText('a description', { max: 5000 }),
})

export const MOVE_AGENDA_ITEM_FORM = z.object({
  itemId: itemId(),
  toPosition: wholeNumber('a position', { min: 0, max: 1000 }),
})

export const REMOVE_AGENDA_ITEM_FORM = z.object({ itemId: itemId() })

export const ROUTE_TO_TRC_FORM = z.object({
  applicationId: recordId('an application'),
  meetingId: optionalRecordId('a meeting'),
})

const VOTES_COPY = 'Enter one vote per line, like "Pat Rowe: for".'

const votes = () =>
  inputField((raw) => {
    const parsed = parseVotes(typeof raw === 'string' ? raw : '')
    return parsed === null ? err(VOTES_COPY) : ok(parsed)
  })

const DECISION_FIELDS = {
  applicationId: recordId('an application'),
  votedOn: civilDate('the date of the vote'),
  outcome: choice('an outcome', DECISION_OUTCOMES),
  motion: requiredText('the motion', { max: 2000 }),
  votes: votes(),
  findings: requiredText('the findings', { max: 10000 }),
  conditions: optionalText('the conditions', { max: 10000 }).transform((v) =>
    parseConditions(v ?? ''),
  ),
  reasons: optionalText('the reasons', { max: 10000 }),
  finalMunicipalApproval: checkbox(),
}

export const RECORD_DECISION_FORM = z.object({ ...DECISION_FIELDS, hearingId: hearingId() })

export const RECORD_DECISION_NO_HEARING_FORM = z.object({
  ...DECISION_FIELDS,
  meetingId: meetingId(),
})

export const DECISION_ONLY_FORM = z.object({ decisionId: decisionId() })

export const FILE_DECISION_FORM = z.object({
  decisionId: decisionId(),
  filedOn: civilDate('the date filed'),
  minutesDocumentId: recordId('the minutes'),
})

export const RECORD_DELIVERY_FORM = z.object({
  deliveryId: recordId('a recipient'),
  method: choice('a way of delivering', DELIVERY_METHODS),
  deliveredOn: civilDate('the date it was delivered'),
})

export const RECORD_FINAL_APPROVAL_FORM = z.object({
  decisionId: decisionId(),
  approvedOn: civilDate('the date of the final written approval'),
})

export const RECORD_REGISTRY_FORM = z.object({
  decisionId: decisionId(),
  registry: requiredText('the registry of deeds', { max: 200 }),
  book: requiredText('the book', { max: 50 }),
  page: requiredText('the page', { max: 50 }),
  recordedOn: civilDate('the date it was recorded'),
  certificateDocumentId: recordId('the recorded certificate'),
})

export const ADD_APPEAL_NODE_FORM = z.object({
  parentId: recordId('the step it follows'),
  kind: choice('a step', APPEAL_KINDS),
  occurredOn: civilDate('the date of the step'),
  outcome: choice('a result', ['', 'granted', 'denied', 'approved'] as const),
  linked: choice('whether it is a linked component', ['yes', 'no'] as const),
  appellantName: optionalText('the appellant name', { max: 200 }),
})
