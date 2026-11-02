import type { RtkCostLine, RtkResponseKind, RtkStatus } from '@/db/schema'
import { formatCents } from '@/lib/money'

export const RTK_STATUS_LABELS: Record<RtkStatus, string> = {
  open: 'Open',
  responded: 'Responded',
  awaiting_decision: 'Waiting for the date the town stated',
  closed: 'Closed',
  withdrawn: 'Withdrawn by the requester',
}

export const RTK_VIA_LABELS = {
  in_person: 'In person',
  mail: 'Mail',
  email: 'Email',
  portal: 'Online',
  phone: 'Phone',
} as const

export const RTK_RESPONSE_LABELS: Record<RtkResponseKind, string> = {
  made_available: 'Records made available',
  website_reference: 'Records are posted on the town website',
  denied: 'Denied, with the exemption cited',
  time_statement: 'Written statement of the time needed',
}

export const RTK_METHOD_LABELS = {
  inspection: 'Inspection at the town office',
  paper: 'Paper copy',
  electronic_link: 'Link sent by email',
  email: 'Email attachment',
} as const

export const RTK_SCOPE_LABELS = {
  withheld_in_full: 'Withheld in full',
  redacted: 'Released with redactions',
} as const

export function costTotal(lines: RtkCostLine[]): string {
  return formatCents(lines.reduce((sum, l) => sum + l.cents, 0))
}
