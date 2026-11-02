import { words } from '@/lib/words'

export type LabelTable = [string, string][]

export const DETERMINATION_OPTIONS: LabelTable = [
  ['yes', 'Potential regional impact'],
  ['no', 'No regional impact'],
  ['previously_determined', 'Previously determined by another board'],
]

export const RECIPIENT_KIND_OPTIONS: LabelTable = [
  ['regional_planning_commission', 'Regional planning commission'],
  ['affected_municipality', 'Affected municipality'],
  ['governing_body', 'Local governing body'],
]

export const NOTICE_METHOD_OPTIONS: LabelTable = [
  ['certified_mail', 'Certified mail'],
  ['hand_delivery', 'Hand delivery'],
  ['email', 'Email'],
  ['other', 'Other'],
]

export const APPEAL_OUTCOME_OPTIONS: LabelTable = [
  ['permit_upheld', 'Permit upheld'],
  ['permit_revoked', 'Permit revoked'],
]

export function labelFor(table: LabelTable, key: string): string {
  return table.find(([k]) => k === key)?.[1] ?? words(key)
}
