import type { Condition, Leaf } from '@/features/forms/condition'
import { ruleSetOf } from '@/features/forms/conditionRules'
import type { FormField } from '@/features/forms/formSchema'

const quoted = (text: string) => `“${text}”`

function answerLabel(field: FormField | undefined, value: string): string {
  return field?.options?.find((o) => o.value === value)?.label ?? value
}

function valuesOf(leaf: Leaf): string[] {
  if (leaf.value === undefined) return []
  return Array.isArray(leaf.value) ? leaf.value : [String(leaf.value)]
}

function leafSentence(leaf: Leaf, fields: readonly FormField[]): string {
  const field = fields.find((f) => f.key === leaf.field)
  const question = quoted(field?.label ?? leaf.field)
  const answers = valuesOf(leaf).map((v) => quoted(answerLabel(field, v)))
  switch (leaf.op) {
    case 'is_true':
      return `you answer ${quoted('Yes')} to ${question}`
    case 'is_false':
      return `you answer ${quoted('No')} to ${question}`
    case 'equals':
    case 'in':
      return `you answer ${answers.join(' or ')} to ${question}`
    case 'not_equals':
      return `your answer to ${question} is not ${answers.join(' or ')}`
    case 'gt':
      return `your answer to ${question} is more than ${valuesOf(leaf).join('')}`
    case 'lt':
      return `your answer to ${question} is less than ${valuesOf(leaf).join('')}`
  }
}

export function plainNeededWhen(condition: Condition, fields: readonly FormField[]): string {
  const set = ruleSetOf(condition)
  const parts = (set?.rules ?? []).map((leaf) => leafSentence(leaf, fields))
  return `Needed only if ${parts.join(set?.join === 'any' ? ', or ' : ', and ')}.`
}
