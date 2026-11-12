export const WORDING_FIELDS = [
  'application.number',
  'applicant.name',
  'town.name',
  'link',
  'fees.amount',
  'receipt.number',
  'inspection.type',
  'inspection.date',
  'inspection.time',
  'inspection.result',
  'permit.revision',
  'account.from',
  'account.in',
  'board.name',
  'project.title',
  'comments.by',
  'clock.name',
  'clock.due',
  'decision.outcome',
  'decision.filedOn',
  'recipient.name',
  'member.title',
  'packet.title',
  'meeting.date',
  'meeting.when',
  'packet.changes',
  'packet.where',
  'meeting.reason',
  'link.days',
  'claim.namedAs',
  'request.number',
  'request.receivedOn',
  'request.due',
  'records.releasedOn',
  'records.linkNote',
] as const

export type WordingField = (typeof WORDING_FIELDS)[number]

export const COMMON_FIELDS: readonly WordingField[] = ['town.name']

export const FIELD_LABELS: Record<WordingField, string> = {
  'application.number': 'Application number',
  'applicant.name': 'Applicant name',
  'town.name': 'Town name',
  link: 'Link, written by Chiban',
  'fees.amount': 'Amount due',
  'receipt.number': 'Receipt number',
  'inspection.type': 'Inspection type',
  'inspection.date': 'Inspection date',
  'inspection.time': 'Inspection time',
  'inspection.result': 'Inspection result',
  'permit.revision': 'Revision number',
  'account.from': 'Where to download it, such as "from your account"',
  'account.in': 'Where to find it, such as "in your account"',
  'board.name': 'Board name',
  'project.title': 'Project title',
  'comments.by': 'Comment deadline',
  'clock.name': 'Deadline name',
  'clock.due': 'Due date',
  'decision.outcome': 'Decision',
  'decision.filedOn': 'Date the decision was filed',
  'recipient.name': "Recipient's name",
  'member.title': 'Seat on the board, such as "alternate"',
  'packet.title': 'Packet title',
  'meeting.date': 'Meeting date',
  'meeting.when': 'Meeting date, time and place',
  'packet.changes': 'What changed in the packet',
  'packet.where': 'Where to read the packet, filled in by Chiban',
  'meeting.reason': 'Why the meeting was cancelled',
  'link.days': 'Days the link works',
  'claim.namedAs': 'How they were named, such as "as a contractor on a project"',
  'request.number': 'Records request number',
  'request.receivedOn': 'Date the request was received',
  'request.due': 'Date the town will answer by',
  'records.releasedOn': 'Date the records were released',
  'records.linkNote': 'Why a link was sent, filled in by Chiban',
}

export type WordingValues = Partial<Record<WordingField, string>>

const KNOWN: ReadonlySet<string> = new Set(WORDING_FIELDS)

export function isWordingField(name: string): name is WordingField {
  return KNOWN.has(name)
}
