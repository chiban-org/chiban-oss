'use client'

import { useState } from 'react'
import { sampleFor, sourceId, sourceLabel } from '@/components/config/fees/feeSources'
import { Check, Input } from '@/components/config/primitives'
import type { NamedChoice } from '@/features/config/referenceChoices'
import { computeFees } from '@/features/fees/computeFees'
import { AFTER_THE_FACT_FIELD, type FeeLineModel } from '@/features/fees/feeEditorModel'
import type { FeeScheduleBody, FeeSource } from '@/features/fees/feeSchema'
import { formatCents } from '@/lib/money'

type Line = FeeScheduleBody['lines'][number]

function sourcesOf(model: FeeLineModel): FeeSource[] {
  const { base } = model
  const all = base.kind === 'per_unit' ? base.rows.map((r) => r.source) : []
  if (base.kind === 'tiered') all.push(base.source)
  const seen = new Map<string, FeeSource>()
  for (const s of all) if (!(s.kind === 'field' && s.field === '')) seen.set(sourceId(s), s)
  return [...seen.values()]
}

export function exampleCents(
  line: Line,
  samples: ReadonlyMap<string, number>,
  afterTheFact: boolean,
): number | null {
  const values: Record<string, number | boolean> = { [AFTER_THE_FACT_FIELD]: afterTheFact }
  let dwellingUnits: number | null = null
  let abutters = 0
  for (const [id, value] of samples) {
    if (id.startsWith('field:')) values[id.slice('field:'.length)] = value
    if (id === 'count:dwelling_units') dwellingUnits = value
    if (id === 'count:abutters_on_issued_list') abutters = value
  }
  const result = computeFees(
    { key: 'example', lines: [line] },
    {
      values,
      facts: { classification: null, dwellingUnits, afterTheFact },
      counts: { abutters: { state: 'known', value: abutters, asOf: 'example' } },
      stage: line.due,
      overrides: [],
    },
  )
  return result.totalCents
}

function sentence(parts: string[], cents: number | null, afterTheFact: boolean): string {
  const amount = cents === null ? 'cannot be worked out yet' : `is ${formatCents(cents)}`
  const lead = parts.length === 0 ? 'For any application' : `For ${parts.join(' and ')},`
  const late = afterTheFact ? ' with work started before the permit,' : ''
  return `${lead}${late} this fee ${amount}.`
}

export function FeeExample({
  line,
  model,
  questions,
}: {
  line: Line
  model: FeeLineModel
  questions: readonly NamedChoice[]
}) {
  const sources = sourcesOf(model)
  const [samples, setSamples] = useState<ReadonlyMap<string, number>>(new Map())
  const [afterTheFact, setAfterTheFact] = useState(false)
  const filled = new Map(
    sources.map((s) => [sourceId(s), samples.get(sourceId(s)) ?? sampleFor(s)]),
  )
  const applies = afterTheFact && model.multiplier !== null
  const parts = sources.map(
    (s) =>
      `${sourceLabel(s, questions)} of ${(filled.get(sourceId(s)) ?? 0).toLocaleString('en-US')}`,
  )
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3" data-fee-example>
      <p className="m-0 text-sm font-medium">Worked example</p>
      {sources.length === 0 && model.multiplier === null ? null : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {sources.map((s) => (
            <Input
              key={sourceId(s)}
              label={`Try ${sourceLabel(s, questions)}`}
              type="number"
              min={0}
              value={filled.get(sourceId(s)) ?? 0}
              onChange={(e) =>
                setSamples(new Map(samples).set(sourceId(s), Number(e.target.value) || 0))
              }
            />
          ))}
          {model.multiplier === null ? null : (
            <Check
              label="Try with work started before the permit"
              checked={afterTheFact}
              onChange={setAfterTheFact}
            />
          )}
        </div>
      )}
      <p className="m-0 mt-2 text-sm" aria-live="polite">
        {sentence(parts, exampleCents(line, filled, applies), applies)}
      </p>
    </div>
  )
}
