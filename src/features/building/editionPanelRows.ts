import type { RecordRule } from '@packs/nh/schema'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import { words } from '@/lib/words'

const NOT_RECORDED = 'Not recorded'

const LABELS: Record<string, string> = {
  receiptDate: 'Application received',
  completedDate: 'Application complete',
  classification: 'Permit type',
  dwellingUnits: 'Dwelling units',
  editionKey: 'Code edition',
  applicantElection: 'Applicant election',
  localAmendmentsInForce: 'Local amendments in force',
}

const DATE_FIELDS = new Set(['receiptDate', 'completedDate'])

function amendmentLine(entry: unknown): string {
  const { title, codeSection } = entry as { title: string; codeSection: string }
  return `${title} (${codeSection})`
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

function displayValue(field: string, value: unknown, record: Record<string, unknown>): string {
  if (field === 'localAmendmentsInForce') {
    return Array.isArray(value) && value.length > 0 ? value.map(amendmentLine).join('; ') : 'None'
  }
  if (isEmpty(value)) return NOT_RECORDED
  if (DATE_FIELDS.has(field)) return formatCivilDate(String(value))
  if (field === 'editionKey' && typeof record.editionLabel === 'string')
    return humanizeIsoDates(record.editionLabel)
  if (field === 'classification') return words(String(value))
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

export function codeEditionPanelRows(
  rule: RecordRule,
  record: Record<string, unknown>,
): { field: string; value: string }[] {
  return rule.fields.map((field) => ({
    field: LABELS[field] ?? words(field),
    value: displayValue(field, record[field], record),
  }))
}
