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
  'board.short_name',
  'board.chair.name',
  'meeting.date',
  'meeting.location',
  'meeting.time',
  'hearing.kind',
  'notice.recipientName',
  'notice.recipientAddress',
  'decision.outcome',
  'decision.votedOn',
  'decision.findings',
  'decision.conditions',
  'decision.reasons',
  'decision.conditionsSection',
  'decision.reasonsSection',
  'decision.appealRights',
  'town.address',
  'town.phone',
  'town.email',
  'town.website',
  'office.name',
  'signer.building_official.name',
  'signer.building_official.title',
  'signer.land_use_administrator.name',
  'signer.land_use_administrator.title',
  'signer.planning_board_chair.name',
  'signer.planning_board_chair.title',
  'signer.zba_chair.name',
  'signer.zba_chair.title',
  'signer.code_enforcement_officer.name',
  'signer.code_enforcement_officer.title',
  'signer.town_clerk.name',
  'signer.town_clerk.title',
  'permit.contractorWithLicense',
  'fees.status',
  'certificate.number',
  'certificate.issuedOn',
  'certificate.finalInspection',
  'certificate.use',
  'order.number',
  'order.property',
  'order.issuedOn',
  'order.authority',
  'order.correctiveAction',
  'order.correctiveDeadline',
  'order.issuerName',
  'order.issuerTitle',
  'rtk.number',
  'rtk.receivedOn',
  'rtk.description',
  'case.number',
  'case.property',
  'case.status',
  'case.openedOn',
  'case.referredOn',
  'receipt.number',
  'receipt.date',
  'receipt.payerName',
  'receipt.total',
  'receipt.footer',
  'packet.title',
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
