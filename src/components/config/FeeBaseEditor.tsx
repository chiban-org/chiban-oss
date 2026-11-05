'use client'

import { sourceFromId, sourceId, sourceOptions } from '@/components/config/fees/feeSources'
import { DollarsInput } from '@/components/config/plainFields'
import { Input, Pick, RowButton, rowKey } from '@/components/config/primitives'
import type { NamedChoice } from '@/features/config/referenceChoices'
import type { FeeBase, FeeLineModel } from '@/features/fees/feeEditorModel'
import type { FeeSource } from '@/features/fees/feeSchema'

const BASES = [
  ['flat', 'A set amount'],
  ['per_unit', 'An amount for each unit of an answer'],
  ['tiered', 'Rates that change in bands'],
] as const

const BLANK_SOURCE: FeeSource = { kind: 'field', field: '' }

export function defaultBase(kind: string, questions: readonly NamedChoice[] = []): FeeBase {
  const first = questions[0]
  const source: FeeSource = first === undefined ? BLANK_SOURCE : { kind: 'field', field: first.key }
  if (kind === 'flat') return { kind: 'flat', cents: 0 }
  if (kind === 'tiered') {
    return { kind: 'tiered', source, mode: 'graduated', tiers: [{ upTo: null, centsPerUnit: 0 }] }
  }
  return { kind: 'per_unit', rows: [{ source, centsPerUnit: 0 }] }
}

function SourcePick({
  label,
  source,
  questions,
  onChange,
}: {
  label: string
  source: FeeSource
  questions: readonly NamedChoice[]
  onChange: (next: FeeSource) => void
}) {
  return (
    <Pick
      label={label}
      value={sourceId(source)}
      options={sourceOptions(source, questions)}
      onChange={(e) => onChange(sourceFromId(e.target.value))}
    />
  )
}

type Rows = Extract<FeeBase, { kind: 'per_unit' }>['rows']

function PerUnitRows({
  rows,
  questions,
  onRows,
}: {
  rows: Rows
  questions: readonly NamedChoice[]
  onRows: (next: Rows) => void
}) {
  const setRow = (i: number, patch: Partial<Rows[number]>) =>
    onRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div key={rowKey('row', i)} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <SourcePick
            label="Count"
            source={row.source}
            questions={questions}
            onChange={(source) => setRow(i, { source })}
          />
          <DollarsInput
            label="Rate for each"
            cents={row.centsPerUnit}
            fractionOfCent
            onCents={(centsPerUnit) => setRow(i, { centsPerUnit })}
            action={
              rows.length > 1 ? (
                <RowButton onClick={() => onRows(rows.filter((_, n) => n !== i))}>Remove</RowButton>
              ) : undefined
            }
          />
        </div>
      ))}
      <div>
        <RowButton onClick={() => onRows([...rows, { source: BLANK_SOURCE, centsPerUnit: 0 }])}>
          Add another answer to count
        </RowButton>
      </div>
    </div>
  )
}

type Tiered = Extract<FeeBase, { kind: 'tiered' }>

function TierRows({
  base,
  questions,
  onBase,
}: {
  base: Tiered
  questions: readonly NamedChoice[]
  onBase: (next: Tiered) => void
}) {
  const setTier = (i: number, patch: Partial<Tiered['tiers'][number]>) =>
    onBase({ ...base, tiers: base.tiers.map((t, n) => (n === i ? { ...t, ...patch } : t)) })
  return (
    <div className="grid gap-3">
      <SourcePick
        label="Count"
        source={base.source}
        questions={questions}
        onChange={(source) => onBase({ ...base, source })}
      />
      <Pick
        label="How the bands apply"
        value={base.mode}
        options={[
          ['graduated', 'Each band at its own rate, like tax brackets'],
          ['bracket', 'The whole amount at the rate of the band it falls in'],
        ]}
        onChange={(e) => onBase({ ...base, mode: e.target.value as Tiered['mode'] })}
      />
      {base.tiers.map((tier, i) => (
        <div key={rowKey('tier', i)} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            label="Band up to"
            hint="Leave empty for everything above the last band."
            type="number"
            min={0}
            value={tier.upTo ?? ''}
            onChange={(e) =>
              setTier(i, { upTo: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
          <DollarsInput
            label="Rate for each"
            cents={tier.centsPerUnit ?? 0}
            fractionOfCent
            onCents={(centsPerUnit) => setTier(i, { centsPerUnit })}
          />
          <DollarsInput
            label="Plus a set amount"
            cents={tier.flatCents ?? 0}
            onCents={(flatCents) => setTier(i, { flatCents })}
            action={
              base.tiers.length > 1 ? (
                <RowButton
                  onClick={() => onBase({ ...base, tiers: base.tiers.filter((_, n) => n !== i) })}
                >
                  Remove
                </RowButton>
              ) : undefined
            }
          />
        </div>
      ))}
      <div>
        <RowButton
          onClick={() =>
            onBase({ ...base, tiers: [...base.tiers, { upTo: null, centsPerUnit: 0 }] })
          }
        >
          Add a band
        </RowButton>
      </div>
    </div>
  )
}

export function BaseEditor({
  model,
  questions,
  onChange,
}: {
  model: FeeLineModel
  questions: readonly NamedChoice[]
  onChange: (m: FeeLineModel) => void
}) {
  const { base } = model
  const setBase = (next: FeeBase) => onChange({ ...model, base: next })
  return (
    <div className="grid gap-3">
      <Pick
        label="How it is worked out"
        value={base.kind}
        options={BASES}
        onChange={(e) => setBase(defaultBase(e.target.value, questions))}
      />
      {base.kind === 'flat' ? (
        <DollarsInput
          label="Amount"
          cents={base.cents}
          onCents={(cents) => setBase({ kind: 'flat', cents })}
        />
      ) : null}
      {base.kind === 'per_unit' ? (
        <PerUnitRows
          rows={base.rows}
          questions={questions}
          onRows={(rows) => setBase({ kind: 'per_unit', rows })}
        />
      ) : null}
      {base.kind === 'tiered' ? (
        <TierRows base={base} questions={questions} onBase={setBase} />
      ) : null}
    </div>
  )
}
