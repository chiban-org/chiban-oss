import type { NamedChoice } from '@/features/config/referenceChoices'
import type { FeeSource } from '@/features/fees/feeSchema'
import { words } from '@/lib/words'

const COUNT_LABELS: ReadonlyMap<string, string> = new Map([
  ['abutters_on_issued_list', 'Each abutter on the notice list'],
  ['dwelling_units', 'Each dwelling unit'],
])

const COUNT_SAMPLES: ReadonlyMap<string, number> = new Map([
  ['abutters_on_issued_list', 12],
  ['dwelling_units', 2],
])

export function sourceId(source: FeeSource): string {
  return source.kind === 'field' ? `field:${source.field}` : `count:${source.what}`
}

export function sourceFromId(id: string): FeeSource {
  if (id === 'count:abutters_on_issued_list') {
    return { kind: 'count_of', what: 'abutters_on_issued_list' }
  }
  if (id === 'count:dwelling_units') return { kind: 'count_of', what: 'dwelling_units' }
  return { kind: 'field', field: id.slice('field:'.length) }
}

export function sourceLabel(source: FeeSource, questions: readonly NamedChoice[]): string {
  if (source.kind === 'count_of') return COUNT_LABELS.get(source.what) ?? words(source.what)
  if (source.field === '') return 'a question'
  return questions.find((q) => q.key === source.field)?.label ?? words(source.field)
}

export function sourceOptions(
  current: FeeSource,
  questions: readonly NamedChoice[],
): [string, string][] {
  const fromForm = questions.map((q): [string, string] => [`field:${q.key}`, q.label])
  const counts = [...COUNT_LABELS].map(([what, label]): [string, string] => [
    `count:${what}`,
    label,
  ])
  const id = sourceId(current)
  const listed = [...fromForm, ...counts].some(([value]) => value === id)
  if (listed) return [...fromForm, ...counts]
  const missing: [string, string] =
    current.kind === 'field' && current.field === ''
      ? [id, 'Choose a question']
      : [id, `${sourceLabel(current, questions)} (not on the form)`]
  return [missing, ...fromForm, ...counts]
}

export function sampleFor(source: FeeSource): number {
  return source.kind === 'field' ? 1000 : (COUNT_SAMPLES.get(source.what) ?? 1)
}
