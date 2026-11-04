import type { Condition, Leaf } from '@/features/forms/condition'
import { conditionFields } from '@/features/forms/condition'
import { conditionOf, ruleSetOf } from '@/features/forms/conditionRules'
import { keyForLabel } from '@/features/forms/fieldKeys'
import {
  type FieldType,
  type FormBody,
  type FormField,
  isChoiceType,
  isNumberType,
} from '@/features/forms/formSchema'

const RULE_NAMES = ['showIf', 'requireIf'] as const

export const ORDER_ISSUE =
  'A rule on this question uses a question that comes after it or no longer exists.'

function otherKeys(body: FormBody, index: number): Set<string> {
  return new Set(body.fields.filter((_, i) => i !== index).map((f) => f.key))
}

function startingChoices(): NonNullable<FormField['options']> {
  return [
    { value: 'choice_1', label: 'Choice 1' },
    { value: 'choice_2', label: 'Choice 2' },
  ]
}

export function addEntry(
  body: FormBody,
  type: FieldType,
  after: number | null,
): { body: FormBody; index: number } {
  const label = type === 'section' ? 'New section' : 'Untitled question'
  const key = keyForLabel(label, new Set(body.fields.map((f) => f.key)))
  const entry: FormField = {
    key,
    label,
    type,
    required: false,
    ...(isChoiceType(type) ? { options: startingChoices() } : {}),
  }
  const index = after === null ? body.fields.length : after + 1
  const fields = [...body.fields.slice(0, index), entry, ...body.fields.slice(index)]
  return { body: { ...body, fields }, index }
}

export function mapConditions(
  field: FormField,
  change: (condition: Condition) => Condition | undefined,
): FormField {
  const next: FormField = { ...field }
  for (const name of RULE_NAMES) {
    const condition = field[name]
    if (condition === undefined) continue
    const changed = change(condition)
    if (changed === undefined) delete next[name]
    else next[name] = changed
  }
  return next
}

export function mapLeaves(
  condition: Condition,
  change: (leaf: Leaf) => Leaf | null,
): Condition | undefined {
  const set = ruleSetOf(condition)
  if (set === null) return condition
  const rules = set.rules.map(change).filter((leaf): leaf is Leaf => leaf !== null)
  return conditionOf({ join: set.join, rules })
}

function renameRefs(field: FormField, from: string, to: string): FormField {
  return mapConditions(field, (c) =>
    mapLeaves(c, (leaf) => (leaf.field === from ? { ...leaf, field: to } : leaf)),
  )
}

export function relabel(
  body: FormBody,
  index: number,
  label: string,
  frozen: ReadonlySet<string>,
): FormBody {
  const field = body.fields[index]
  if (field === undefined) return body
  const taken = otherKeys(body, index)
  const follows = !frozen.has(field.key) && keyForLabel(field.label, taken) === field.key
  const key = follows ? keyForLabel(label, taken) : field.key
  return {
    ...body,
    fields: body.fields.map((f, i) =>
      i === index ? { ...f, label, key } : key === field.key ? f : renameRefs(f, field.key, key),
    ),
  }
}

export function patchField(body: FormBody, index: number, patch: Partial<FormField>): FormBody {
  return { ...body, fields: body.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) }
}

export function setKey(body: FormBody, index: number, key: string): FormBody {
  return patchField(body, index, { key })
}

export function removeEntry(body: FormBody, index: number): FormBody {
  const removed = body.fields[index]?.key
  return {
    ...body,
    fields: body.fields
      .filter((_, i) => i !== index)
      .map((f) => mapConditions(f, (c) => mapLeaves(c, (l) => (l.field === removed ? null : l)))),
  }
}

export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  const moving = items[from]
  if (moving === undefined || to < 0 || to >= items.length || from === to) return items
  const rest = items.filter((_, i) => i !== from)
  return [...rest.slice(0, to), moving, ...rest.slice(to)]
}

export function moveEntry(body: FormBody, from: number, to: number): FormBody {
  const fields = moveItem(body.fields, from, to)
  return fields === body.fields ? body : { ...body, fields: [...fields] }
}

export function changeType(body: FormBody, index: number, type: FieldType): FormBody {
  return {
    ...body,
    fields: body.fields.map((f, i) => {
      if (i !== index) return f
      const { options, validation, ...rest } = f
      return {
        ...rest,
        type,
        ...(isChoiceType(type) ? { options: options ?? startingChoices() } : {}),
        ...(isNumberType(type) && validation !== undefined ? { validation } : {}),
      }
    }),
  }
}

export function orderIssues(body: FormBody): Record<number, string> {
  const issues: Record<number, string> = {}
  const earlier = new Set<string>()
  body.fields.forEach((field, i) => {
    const refs = RULE_NAMES.flatMap((name) => {
      const condition = field[name]
      return condition === undefined ? [] : conditionFields(condition)
    })
    if (refs.some((ref) => !earlier.has(ref))) issues[i] = ORDER_ISSUE
    if (field.type !== 'section') earlier.add(field.key)
  })
  return issues
}

export function indexAfterMove(selected: number | null, from: number, to: number): number | null {
  if (selected === null) return null
  if (selected === from) return to
  if (from < selected && to >= selected) return selected - 1
  if (from > selected && to <= selected) return selected + 1
  return selected
}
