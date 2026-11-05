import type { abutterListRecipients } from '@/db/schema'
import type { Recipient } from '@/features/abutters/resolution'
import { RECIPIENT_ROLE_LABELS } from '@/features/abutters/roles'
import { type SourceLine, sourceLines } from '@/features/abutters/sourceLinks'

export interface RecipientView {
  id: string
  name: string
  mailingAddress: string | null
  roles: string[]
  statusText: string
  provenance: SourceLine[]
  excluded: boolean
  exclusionReason: string | null
  needsDecision: boolean
  tenantDecided: boolean
  decisionText: string | null
  corrected: boolean
}

export function frozenView(data: Recipient, index: number): RecipientView {
  return {
    id: `frozen-${index}`,
    name: data.name,
    mailingAddress: data.mailingAddress,
    roles: data.roles.map((r) => RECIPIENT_ROLE_LABELS[r]),
    statusText: 'Complete',
    provenance: sourceLines(data.provenance),
    excluded: false,
    exclusionReason: null,
    needsDecision: false,
    tenantDecided: false,
    decisionText: null,
    corrected: data.provenance.some((p) => p.source === 'staff_entry'),
  }
}

export function recipientView(row: typeof abutterListRecipients.$inferSelect): RecipientView {
  const data = row.data as Recipient
  const decision =
    row.qualifies === null
      ? null
      : `${row.qualifies ? 'Counts as an abutter' : 'Does not count as an abutter'}: ${row.decisionReason ?? ''}`
  return {
    id: row.id,
    name: data.name,
    mailingAddress: data.mailingAddress,
    roles: data.roles.map((r) => RECIPIENT_ROLE_LABELS[r]),
    statusText:
      data.status === 'needs_decision'
        ? row.qualifies === null
          ? 'Needs a staff decision'
          : 'Decided by staff'
        : data.status === 'incomplete_data'
          ? 'Missing name or address'
          : 'Complete',
    provenance: sourceLines(data.provenance),
    excluded: row.excluded,
    exclusionReason: row.exclusionReason,
    needsDecision: data.status === 'needs_decision' && row.qualifies === null,
    tenantDecided: data.status === 'needs_decision' && row.qualifies !== null,
    decisionText: decision,
    corrected: data.provenance.some((p) => p.source === 'staff_entry'),
  }
}
