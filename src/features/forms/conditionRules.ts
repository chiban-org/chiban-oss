import type { Condition, Leaf } from '@/features/forms/condition'
import { type FieldType, type FormField, isNumberType } from '@/features/forms/formSchema'

export type Operator = Leaf['op']
export type Join = 'leaf' | 'all' | 'any'

export interface RuleSet {
  join: Join
  rules: Leaf[]
}

export function ruleSetOf(condition: Condition | undefined): RuleSet | null {
  if (condition === undefined) return null
  if ('all' in condition) return { join: 'all', rules: condition.all }
  if ('any' in condition) return { join: 'any', rules: condition.any }
  return { join: 'leaf', rules: [condition] }
}

export function conditionOf(set: RuleSet): Condition | undefined {
  const [first, ...rest] = set.rules
  if (first === undefined) return undefined
  if (set.join === 'any') return { any: set.rules }
  if (set.join === 'all' || rest.length > 0) return { all: set.rules }
  return first
}

const CHOICE_OPS: Operator[] = ['equals', 'not_equals', 'in']
const YES_NO_OPS: Operator[] = ['is_true', 'is_false']
const NUMBER_OPS: Operator[] = ['equals', 'not_equals', 'gt', 'lt']
const TEXT_OPS: Operator[] = ['equals', 'not_equals']

export function operatorsFor(type: FieldType): Operator[] {
  if (type === 'select') return CHOICE_OPS
  if (type === 'checkbox') return YES_NO_OPS
  if (isNumberType(type)) return NUMBER_OPS
  return TEXT_OPS
}

export const OPERATOR_WORDS: Record<Operator, string> = {
  equals: 'is',
  not_equals: 'is not',
  in: 'is any of',
  is_true: 'is yes',
  is_false: 'is no',
  gt: 'is more than',
  lt: 'is less than',
}

export function conditionSources(fields: readonly FormField[], index: number): FormField[] {
  return fields.slice(0, index).filter((f) => f.type !== 'section' && f.type !== 'multiselect')
}

export function retarget(field: FormField): Leaf {
  const [op = 'equals'] = operatorsFor(field.type)
  if (op === 'is_true') return { field: field.key, op }
  return { field: field.key, op, value: field.options?.[0]?.value ?? '' }
}

function firstText(value: Leaf['value']): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value === undefined ? '' : String(value)
}

function numberOrText(text: string): number | string {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) ? n : text
}

export function changeOperator(leaf: Leaf, op: Operator): Leaf {
  if (op === 'is_true' || op === 'is_false') return { field: leaf.field, op }
  const text = firstText(leaf.value)
  if (op === 'in') {
    return { field: leaf.field, op, value: Array.isArray(leaf.value) ? leaf.value : [text] }
  }
  if (op === 'gt' || op === 'lt') return { field: leaf.field, op, value: numberOrText(text) }
  return { field: leaf.field, op, value: text }
}

function valueWords(leaf: Leaf, field: FormField | undefined): string {
  const label = (v: string) => field?.options?.find((o) => o.value === v)?.label ?? v
  if (leaf.value === undefined) return ''
  const values = Array.isArray(leaf.value) ? leaf.value : [String(leaf.value)]
  return ` ${values.map(label).join(', ')}`
}

function leafWords(leaf: Leaf, fields: readonly FormField[]): string {
  const field = fields.find((f) => f.key === leaf.field)
  return `${field?.label ?? leaf.field} ${OPERATOR_WORDS[leaf.op]}${valueWords(leaf, field)}`
}

export function describeCondition(condition: Condition, fields: readonly FormField[]): string {
  const set = ruleSetOf(condition)
  const words = (set?.rules ?? []).map((leaf) => leafWords(leaf, fields))
  return words.join(set?.join === 'any' ? ', or ' : ', and ')
}
