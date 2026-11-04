'use client'

import { RuleValue } from '@/components/config/formBuilder/RuleValue'
import { Pick } from '@/components/config/primitives'
import { Button } from '@/components/ui/button'
import type { Condition, Leaf } from '@/features/forms/condition'
import {
  changeOperator,
  conditionOf,
  conditionSources,
  type Join,
  OPERATOR_WORDS,
  operatorsFor,
  type RuleSet,
  retarget,
  ruleSetOf,
} from '@/features/forms/conditionRules'
import type { FormField } from '@/features/forms/formSchema'

const MATCH_CHOICES = [
  ['all', 'All of these rules'],
  ['any', 'Any of these rules'],
] as const

function questionChoices(sources: FormField[], leaf: Leaf): [string, string][] {
  const listed = sources.map((f): [string, string] => [f.key, f.label])
  if (sources.some((f) => f.key === leaf.field)) return listed
  return [[leaf.field, `${leaf.field} (not an earlier question)`], ...listed]
}

function RuleRow({
  leaf,
  sources,
  fields,
  onChange,
  onRemove,
}: {
  leaf: Leaf
  sources: FormField[]
  fields: FormField[]
  onChange: (next: Leaf) => void
  onRemove: () => void
}) {
  const source = fields.find((f) => f.key === leaf.field)
  const ops = source === undefined ? [leaf.op] : operatorsFor(source.type)
  const opChoices = (ops.includes(leaf.op) ? ops : [leaf.op, ...ops]).map(
    (op): [string, string] => [op, OPERATOR_WORDS[op]],
  )
  return (
    <li className="grid gap-2 rounded-md border border-hairline p-2">
      <Pick
        label="Question"
        value={leaf.field}
        options={questionChoices(sources, leaf)}
        onChange={(e) => {
          const next = fields.find((f) => f.key === e.target.value)
          if (next !== undefined) onChange(retarget(next))
        }}
      />
      <Pick
        label="Test"
        value={leaf.op}
        options={opChoices}
        onChange={(e) => onChange(changeOperator(leaf, e.target.value as Leaf['op']))}
      />
      <RuleValue leaf={leaf} source={source} onChange={onChange} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={onRemove}
      >
        Remove rule
      </Button>
    </li>
  )
}

export function ConditionBuilder({
  title,
  fields,
  index,
  value,
  onChange,
}: {
  title: string
  fields: FormField[]
  index: number
  value: Condition | undefined
  onChange: (next: Condition | undefined) => void
}) {
  const set: RuleSet = ruleSetOf(value) ?? { join: 'leaf', rules: [] }
  const sources = conditionSources(fields, index)
  const update = (next: RuleSet) => onChange(conditionOf(next))
  const first = sources[0]
  const add = () => {
    if (first !== undefined) update({ ...set, rules: [...set.rules, retarget(first)] })
  }
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {set.rules.length > 1 ? (
        <Pick
          label="Match"
          value={set.join === 'any' ? 'any' : 'all'}
          options={MATCH_CHOICES}
          onChange={(e) => update({ ...set, join: e.target.value as Join })}
        />
      ) : null}
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {set.rules.map((leaf, r) => (
          <RuleRow
            key={`rule-${String(r)}`}
            leaf={leaf}
            sources={sources}
            fields={fields}
            onChange={(next) =>
              update({ ...set, rules: set.rules.map((l, i) => (i === r ? next : l)) })
            }
            onRemove={() => update({ ...set, rules: set.rules.filter((_, i) => i !== r) })}
          />
        ))}
      </ul>
      {first === undefined ? (
        <p className="m-0 text-sm text-muted-foreground">
          Rules can use the questions above this one. There are none yet.
        </p>
      ) : (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={add}>
          {set.rules.length === 0 ? 'Add a rule' : 'Add another rule'}
        </Button>
      )}
    </fieldset>
  )
}
