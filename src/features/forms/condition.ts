import { z } from 'zod'

export const LeafSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['equals', 'not_equals', 'in', 'is_true', 'is_false', 'gt', 'lt']),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
})
export type Leaf = z.infer<typeof LeafSchema>

export const ConditionSchema = z.union([
  LeafSchema,
  z.object({ all: z.array(LeafSchema).min(1) }),
  z.object({ any: z.array(LeafSchema).min(1) }),
])
export type Condition = z.infer<typeof ConditionSchema>

export type ConditionValues = Readonly<Record<string, unknown>>

function evaluateLeaf(leaf: Leaf, values: ConditionValues): boolean {
  const actual = values[leaf.field]
  switch (leaf.op) {
    case 'equals':
      return String(actual) === String(leaf.value)
    case 'not_equals':
      return String(actual) !== String(leaf.value)
    case 'in':
      return Array.isArray(leaf.value) && leaf.value.includes(String(actual))
    case 'is_true':
      return actual === true
    case 'is_false':
      return actual !== true
    case 'gt':
      return Number(actual) > Number(leaf.value)
    case 'lt':
      return Number(actual) < Number(leaf.value)
  }
}

export function evaluateCondition(condition: Condition, values: ConditionValues): boolean {
  if ('all' in condition) return condition.all.every((l) => evaluateLeaf(l, values))
  if ('any' in condition) return condition.any.some((l) => evaluateLeaf(l, values))
  return evaluateLeaf(condition, values)
}

export function conditionFields(condition: Condition): string[] {
  if ('all' in condition) return condition.all.map((l) => l.field)
  if ('any' in condition) return condition.any.map((l) => l.field)
  return [condition.field]
}
