export const MERGE_FIELDS = [
  'town.name',
  'application.number',
  'application.typeLabel',
  'application.issuedOn',
  'application.expiresOn',
  'parcel.displayId',
  'parcel.siteAddress',
  'parcel.ownerName',
  'project.title',
  'party.applicant.name',
  'party.contractor.name',
  'fees.totalFormatted',
  'conditions.list',
  'codeEdition.label',
  'board.name',
  'meeting.date',
  'meeting.location',
  'meeting.time',
  'hearing.kind',
  'notice.recipientName',
  'decision.outcome',
  'decision.votedOn',
  'decision.findings',
  'decision.conditions',
  'decision.reasons',
  'decision.appealRights',
] as const

export type MergeField = (typeof MERGE_FIELDS)[number]

const KNOWN: ReadonlySet<string> = new Set(MERGE_FIELDS)

export function isMergeField(name: string): name is MergeField {
  return KNOWN.has(name)
}

export interface TemplateToken {
  start: number
  end: number
  name: string
}

export function scanTokens(body: string): TemplateToken[] {
  const tokens: TemplateToken[] = []
  let cursor = 0
  for (;;) {
    const open = body.indexOf('{{', cursor)
    if (open === -1) return tokens
    const close = body.indexOf('}}', open + 2)
    if (close === -1) return tokens
    tokens.push({ start: open, end: close + 2, name: body.slice(open + 2, close).trim() })
    cursor = close + 2
  }
}

export function unknownMergeFields(body: string): string[] {
  const unknown = scanTokens(body)
    .map((t) => t.name)
    .filter((n) => !isMergeField(n))
  return [...new Set(unknown)]
}
