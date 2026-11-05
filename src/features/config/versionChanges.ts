import { describePath, describeValue } from '@/features/config/diffText'
import { starterDiff } from '@/features/config/starterDiff'
import { formatCivilDate } from '@/lib/formatDate'

export interface FieldChange {
  path: string
  label: string
  before: string
  after: string
  inline: boolean
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const LONG_TEXT = 60
const NOTHING = 'nothing'

function shown(path: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return NOTHING
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatCivilDate(value)
  return describeValue(path, value)
}

function isLongText(before: unknown, after: unknown): boolean {
  if (typeof before !== 'string' || typeof after !== 'string') return false
  return [before, after].some((t) => t.includes('\n') || t.length > LONG_TEXT)
}

export function versionChanges(
  previous: unknown,
  next: unknown,
  labels: Readonly<Record<string, string>> = {},
): FieldChange[] {
  return starterDiff(next, previous).map((entry) => ({
    path: entry.path,
    label: labels[entry.path] ?? describePath(entry.path),
    before: shown(entry.path, entry.upstream),
    after: shown(entry.path, entry.town),
    inline: isLongText(entry.upstream, entry.town),
  }))
}
