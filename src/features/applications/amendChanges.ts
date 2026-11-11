import { displayFieldValue } from '@/features/forms/displayValue'
import { type FormBody, type FormField, questionsOf } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'

export interface AnswerChange {
  label: string
  from: string
  to: string
}

const BLANK_ANSWER = 'blank'
const MAX_SHOWN_ANSWER = 80
const SHORTENED_MARK = '...'
const AMENDED = 'Amended the application'

function shown(field: FormField, value: FieldValue | undefined): string {
  if (value === undefined) return BLANK_ANSWER
  const text = displayFieldValue(field, value)
  return text.length > MAX_SHOWN_ANSWER
    ? `${text.slice(0, MAX_SHOWN_ANSWER - SHORTENED_MARK.length)}${SHORTENED_MARK}`
    : text
}

function sameAnswer(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function answerChanges(
  form: FormBody,
  before: Readonly<Record<string, FieldValue>>,
  after: Readonly<Record<string, FieldValue>>,
): AnswerChange[] {
  return questionsOf(form.fields)
    .filter((field) => !sameAnswer(before[field.key], after[field.key]))
    .map((field) => ({
      label: field.label,
      from: shown(field, before[field.key]),
      to: shown(field, after[field.key]),
    }))
}

function isChange(entry: unknown): entry is AnswerChange {
  if (typeof entry !== 'object' || entry === null) return false
  const fields = new Map(Object.entries(entry))
  return ['label', 'from', 'to'].every((key) => typeof fields.get(key) === 'string')
}

export function amendPhrase(changes: unknown): string {
  if (!Array.isArray(changes) || !changes.every(isChange)) return AMENDED
  if (changes.length === 0) return `${AMENDED}, no answers changed`
  return `${AMENDED}: ${changes.map((c) => `${c.label} from ${c.from} to ${c.to}`).join('; ')}`
}
