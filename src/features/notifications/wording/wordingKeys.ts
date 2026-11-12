import type { WordingField } from '@/features/notifications/wording/wordingFields'

export const WORDING_KEYS = [
  'application_submitted',
  'fees_due',
  'payment_received',
  'application_issued',
  'application_denied',
  'inspection_scheduled',
  'inspection_cancelled',
  'inspection_result',
  'permit_corrected',
  'permit_corrected_contractor_removed',
  'review_assigned',
  'board_comment_requested',
  'clock_due_soon',
  'clock_overdue',
  'decision_filed',
  'board_member_added',
  'board_packet_ready',
  'board_packet_link',
  'board_packet_updated',
  'board_meeting_cancelled',
  'project_claim',
  'rtk_request_received',
  'rtk_letter_sent',
  'rtk_records_link',
  'rtk_records_attached',
] as const

export type WordingKey = (typeof WORDING_KEYS)[number]

export type WordingAudience = 'applicants' | 'staff' | 'reviewers' | 'boards' | 'requesters'

export type WordingLinkMode = 'required' | 'optional' | 'none'

export interface WordingKeyInfo {
  label: string
  audience: WordingAudience
  fields: readonly WordingField[]
  link: WordingLinkMode
  linkLabel?: string
  requiredFields?: readonly WordingField[]
}

const APPLICATION: readonly WordingField[] = ['application.number', 'applicant.name']

const INSPECTION: readonly WordingField[] = [
  'inspection.type',
  'inspection.date',
  'inspection.time',
]

const PACKET: readonly WordingField[] = ['board.name', 'packet.title', 'meeting.date']

const REQUEST: readonly WordingField[] = ['request.number']

export const WORDING_KEY_INFO: Record<WordingKey, WordingKeyInfo> = {
  application_submitted: {
    label: 'Application received',
    audience: 'applicants',
    fields: [...APPLICATION],
    link: 'required',
  },
  fees_due: {
    label: 'Fees due',
    audience: 'applicants',
    fields: [...APPLICATION, 'fees.amount'],
    link: 'required',
  },
  payment_received: {
    label: 'Payment received',
    audience: 'applicants',
    fields: [...APPLICATION, 'receipt.number'],
    link: 'required',
  },
  application_issued: {
    label: 'Permit issued',
    audience: 'applicants',
    fields: [...APPLICATION, 'account.from'],
    link: 'required',
  },
  application_denied: {
    label: 'Application denied',
    audience: 'applicants',
    fields: [...APPLICATION],
    link: 'required',
  },
  inspection_scheduled: {
    label: 'Inspection scheduled',
    audience: 'applicants',
    fields: [...APPLICATION, ...INSPECTION],
    link: 'required',
  },
  inspection_cancelled: {
    label: 'Inspection cancelled',
    audience: 'applicants',
    fields: [...APPLICATION, 'inspection.type'],
    link: 'required',
  },
  inspection_result: {
    label: 'Inspection result',
    audience: 'applicants',
    fields: [...APPLICATION, 'inspection.type', 'inspection.result'],
    link: 'required',
  },
  permit_corrected: {
    label: 'Permit corrected',
    audience: 'applicants',
    fields: [...APPLICATION, 'permit.revision', 'account.in'],
    link: 'required',
  },
  permit_corrected_contractor_removed: {
    label: 'Permit corrected, contractor removed',
    audience: 'applicants',
    fields: [...APPLICATION, 'permit.revision'],
    link: 'required',
  },
  review_assigned: {
    label: 'Review requested',
    audience: 'reviewers',
    fields: [...APPLICATION],
    link: 'required',
  },
  board_comment_requested: {
    label: 'Board comments requested',
    audience: 'boards',
    fields: [...APPLICATION, 'board.name', 'project.title', 'comments.by'],
    link: 'required',
  },
  clock_due_soon: {
    label: 'Deadline coming up',
    audience: 'staff',
    fields: [...APPLICATION, 'clock.name', 'clock.due'],
    link: 'required',
  },
  clock_overdue: {
    label: 'Deadline passed',
    audience: 'staff',
    fields: [...APPLICATION, 'clock.name', 'clock.due'],
    link: 'required',
  },
  decision_filed: {
    label: 'Board decision filed',
    audience: 'applicants',
    fields: [...APPLICATION, 'board.name', 'decision.outcome', 'decision.filedOn', 'account.from'],
    link: 'required',
  },
  board_member_added: {
    label: 'Added to a board',
    audience: 'boards',
    fields: ['board.name', 'member.title'],
    link: 'required',
    linkLabel: 'Open the board pages',
  },
  board_packet_ready: {
    label: 'Board packet ready',
    audience: 'boards',
    fields: [...PACKET, 'meeting.when'],
    link: 'required',
    linkLabel: 'Open the board pages',
  },
  board_packet_link: {
    label: 'Board packet ready, by link',
    audience: 'boards',
    fields: [...PACKET, 'meeting.when', 'recipient.name', 'link.days'],
    link: 'required',
    requiredFields: ['link.days'],
  },
  board_packet_updated: {
    label: 'Board packet updated',
    audience: 'boards',
    fields: [...PACKET, 'packet.changes', 'packet.where'],
    link: 'optional',
    linkLabel: 'Open the board pages',
  },
  board_meeting_cancelled: {
    label: 'Meeting cancelled',
    audience: 'boards',
    fields: [...PACKET, 'meeting.reason'],
    link: 'none',
  },
  project_claim: {
    label: 'Claim a project',
    audience: 'applicants',
    fields: ['recipient.name', 'claim.namedAs', 'project.title', 'link.days'],
    link: 'required',
    linkLabel: 'Claim the project',
    requiredFields: ['link.days'],
  },
  rtk_request_received: {
    label: 'Records request received',
    audience: 'requesters',
    fields: [...REQUEST, 'request.receivedOn', 'request.due'],
    link: 'required',
    requiredFields: ['request.number', 'request.due'],
  },
  rtk_letter_sent: {
    label: 'Letter about a records request',
    audience: 'requesters',
    fields: [...REQUEST],
    link: 'none',
  },
  rtk_records_link: {
    label: 'Records ready, by link',
    audience: 'requesters',
    fields: [...REQUEST, 'records.releasedOn', 'records.linkNote', 'link.days'],
    link: 'required',
    linkLabel: 'Open the records',
    requiredFields: ['link.days'],
  },
  rtk_records_attached: {
    label: 'Records attached',
    audience: 'requesters',
    fields: [...REQUEST, 'records.releasedOn'],
    link: 'none',
  },
}

export function isWordingKey(value: string): value is WordingKey {
  return (WORDING_KEYS as readonly string[]).includes(value)
}
