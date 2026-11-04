import type { Leaf } from '@/features/forms/condition'
import { keyForLabel } from '@/features/forms/fieldKeys'
import { mapConditions, mapLeaves, moveItem } from '@/features/forms/formEdits'
import type { FormBody, FormField } from '@/features/forms/formSchema'

type Choice = NonNullable<FormField['options']>[number]

function withChoices(
  body: FormBody,
  index: number,
  change: (choices: Choice[]) => Choice[],
): FormBody {
  return {
    ...body,
    fields: body.fields.map((f, i) =>
      i === index ? { ...f, options: change(f.options ?? []) } : f,
    ),
  }
}

function takenValues(choices: readonly Choice[], except: number): Set<string> {
  return new Set(choices.filter((_, i) => i !== except).map((c) => c.value))
}

export function addChoice(body: FormBody, index: number): FormBody {
  return withChoices(body, index, (choices) => {
    const label = `Choice ${choices.length + 1}`
    return [...choices, { value: keyForLabel(label, takenValues(choices, -1)), label }]
  })
}

function renameValue(leaf: Leaf, field: string, from: string, to: string): Leaf {
  if (leaf.field !== field) return leaf
  if (Array.isArray(leaf.value)) {
    return { ...leaf, value: leaf.value.map((v) => (v === from ? to : v)) }
  }
  return leaf.value === from ? { ...leaf, value: to } : leaf
}

export function relabelChoice(
  body: FormBody,
  at: { index: number; choice: number },
  label: string,
  frozen: ReadonlySet<string>,
): FormBody {
  const { index, choice } = at
  const field = body.fields[index]
  const old = field?.options?.[choice]
  if (field === undefined || old === undefined) return body
  const taken = takenValues(field.options ?? [], choice)
  const follows = !frozen.has(field.key) && keyForLabel(old.label, taken) === old.value
  const value = follows ? keyForLabel(label, taken) : old.value
  const relabeled = withChoices(body, index, (choices) =>
    choices.map((c, i) => (i === choice ? { value, label } : c)),
  )
  if (value === old.value) return relabeled
  return {
    ...relabeled,
    fields: relabeled.fields.map((f) =>
      mapConditions(f, (c) => mapLeaves(c, (l) => renameValue(l, field.key, old.value, value))),
    ),
  }
}

export function removeChoice(body: FormBody, index: number, choice: number): FormBody {
  return withChoices(body, index, (choices) => choices.filter((_, i) => i !== choice))
}

export function moveChoice(body: FormBody, index: number, choice: number, by: -1 | 1): FormBody {
  const choices = body.fields[index]?.options ?? []
  const moved = moveItem(choices, choice, choice + by)
  return moved === choices ? body : withChoices(body, index, () => [...moved])
}
