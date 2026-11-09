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
] as const

export type WordingField = (typeof WORDING_FIELDS)[number]

export const COMMON_FIELDS: readonly WordingField[] = [
  'application.number',
  'applicant.name',
  'town.name',
  'link',
]

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
}

export type WordingValues = Partial<Record<WordingField, string>>

const KNOWN: ReadonlySet<string> = new Set(WORDING_FIELDS)

export function isWordingField(name: string): name is WordingField {
  return KNOWN.has(name)
}
