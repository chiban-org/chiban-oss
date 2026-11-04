import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { ConfigKind } from '@/features/config/kinds'
import type { FormBody } from '@/features/forms/formSchema'
import { isNumberType } from '@/features/forms/formSchema'
import { type ChecklistBody, isFinalChecklist } from '@/features/inspections/checklistSchema'
import { words } from '@/lib/words'

export interface NamedChoice {
  key: string
  label: string
  note?: string
}

export const REFERENCE_KINDS = [
  'application_type',
  'form',
  'fee_schedule',
  'condition_library',
  'inspection_checklist',
  'template',
] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

export type ReferenceChoices = Record<ReferenceKind, NamedChoice[]>

export const NO_REFERENCE_CHOICES: ReferenceChoices = {
  application_type: [],
  form: [],
  fee_schedule: [],
  condition_library: [],
  inspection_checklist: [],
  template: [],
}

export function keyWords(key: string): string {
  return words(key.replaceAll(/[-.]+/g, '_'))
}

export interface ReferenceRow {
  kind: string
  key: string
  status: string
  body: unknown
}

const USED_BY_SUFFIX: ReadonlyMap<ConfigKind, string> = new Map<ConfigKind, string>([
  ['fee_schedule', 'fees'],
  ['condition_library', 'conditions'],
])

function latest(rows: ReferenceRow[]): ReferenceRow[] {
  const byKey = new Map<string, ReferenceRow>()
  for (const row of rows) {
    const id = `${row.kind}:${row.key}`
    const held = byKey.get(id)
    if (held === undefined || row.status === 'draft') byKey.set(id, row)
  }
  return [...byKey.values()]
}

function bodyLabel(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('label' in body)) return null
  return typeof body.label === 'string' && body.label !== '' ? body.label : null
}

export function usedByLabels(
  types: readonly ApplicationTypeBody[],
  kind: ConfigKind,
): Map<string, string> {
  const suffix = USED_BY_SUFFIX.get(kind)
  const out = new Map<string, string>()
  if (suffix === undefined) return out
  for (const type of types) {
    const key = kind === 'fee_schedule' ? type.feeScheduleKey : type.conditionLibraryKey
    if (!out.has(key)) out.set(key, `${type.label} ${suffix}`)
  }
  return out
}

function noteFor(row: ReferenceRow): string | undefined {
  if (row.kind === 'inspection_checklist' && isFinalChecklist(row.body as ChecklistBody)) {
    return row.status === 'draft' ? 'closes the permit, not published yet' : 'closes the permit'
  }
  return row.status === 'draft' ? 'not published yet' : undefined
}

export function choicesFromRows(rows: ReferenceRow[]): ReferenceChoices {
  const current = latest(rows)
  const types = current
    .filter((r) => r.kind === 'application_type')
    .map((r) => r.body as ApplicationTypeBody)
  const listFor = (kind: ReferenceKind): NamedChoice[] => {
    const used = usedByLabels(types, kind)
    return current
      .filter((r) => r.kind === kind)
      .map((r) => {
        const label = bodyLabel(r.body) ?? used.get(r.key) ?? keyWords(r.key)
        const note = noteFor(r)
        return note === undefined ? { key: r.key, label } : { key: r.key, label, note }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }
  return {
    application_type: listFor('application_type'),
    form: listFor('form'),
    fee_schedule: listFor('fee_schedule'),
    condition_library: listFor('condition_library'),
    inspection_checklist: listFor('inspection_checklist'),
    template: listFor('template'),
  }
}

export function numberQuestionsFor(rows: ReferenceRow[], feeScheduleKey: string): NamedChoice[] {
  const current = latest(rows)
  const formKeys = new Set(
    current
      .filter((r) => r.kind === 'application_type')
      .map((r) => r.body as ApplicationTypeBody)
      .filter((t) => t.feeScheduleKey === feeScheduleKey)
      .map((t) => t.formKey),
  )
  const seen = new Map<string, NamedChoice>()
  for (const row of current) {
    if (row.kind !== 'form' || !formKeys.has(row.key)) continue
    for (const field of (row.body as FormBody).fields) {
      if (isNumberType(field.type) && !seen.has(field.key)) {
        seen.set(field.key, { key: field.key, label: field.label })
      }
    }
  }
  return [...seen.values()]
}

export function namedKeyRows<T extends { key: string; label: string | null }>(
  rows: readonly T[],
  kind: ConfigKind,
  choices: ReferenceChoices,
): (T & { label: string })[] {
  const listed = new Map(
    (REFERENCE_KINDS as readonly string[]).includes(kind)
      ? choices[kind as ReferenceKind].map((c) => [c.key, c.label] as const)
      : [],
  )
  return rows
    .map((row) => ({ ...row, label: row.label ?? listed.get(row.key) ?? keyWords(row.key) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
