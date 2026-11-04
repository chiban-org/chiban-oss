'use client'

import { TextRows } from '@/components/config/plainFields'
import { Check, Input, Pick } from '@/components/config/primitives'
import type { Leaf } from '@/features/forms/condition'
import type { FormField } from '@/features/forms/formSchema'
import { isNumberQuestion } from '@/features/forms/questionTypes'

function asText(value: Leaf['value']): string {
  if (Array.isArray(value)) return value.join(', ')
  return value === undefined ? '' : String(value)
}

function typedNumber(text: string, op: Leaf['op']): string | number {
  if (op !== 'gt' && op !== 'lt') return text
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) ? n : text
}

export function RuleValue({
  leaf,
  source,
  onChange,
}: {
  leaf: Leaf
  source: FormField | undefined
  onChange: (next: Leaf) => void
}) {
  if (leaf.op === 'is_true' || leaf.op === 'is_false') return null
  const options = source?.options ?? []
  if (options.length > 0 && leaf.op === 'in') {
    const chosen = Array.isArray(leaf.value) ? leaf.value : []
    return (
      <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-2 border-0 p-0">
        <legend className="sr-only">Answer</legend>
        {options.map((o) => (
          <Check
            key={o.value}
            label={o.label}
            checked={chosen.includes(o.value)}
            onChange={(on) =>
              onChange({
                ...leaf,
                value: on ? [...chosen, o.value] : chosen.filter((v) => v !== o.value),
              })
            }
          />
        ))}
      </fieldset>
    )
  }
  if (options.length > 0) {
    return (
      <Pick
        label="Answer"
        value={asText(leaf.value)}
        options={options.map((o): [string, string] => [o.value, o.label])}
        onChange={(e) => onChange({ ...leaf, value: e.target.value })}
      />
    )
  }
  if (leaf.op === 'in') {
    return (
      <TextRows
        legend="Any of these answers"
        rowLabel="Answer"
        addLabel="Add an answer"
        values={Array.isArray(leaf.value) ? leaf.value : []}
        onChange={(value) => onChange({ ...leaf, value })}
      />
    )
  }
  return (
    <Input
      label="Answer"
      inputMode={source !== undefined && isNumberQuestion(source) ? 'decimal' : undefined}
      value={asText(leaf.value)}
      onChange={(e) => onChange({ ...leaf, value: typedNumber(e.target.value, leaf.op) })}
    />
  )
}
