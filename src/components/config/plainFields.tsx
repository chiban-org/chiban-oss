'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { Input, Pick, RowButton } from '@/components/config/primitives'
import { Field, useFieldIds } from '@/components/staff/fields'
import { Input as BareInput } from '@/components/ui/input'
import type { NamedChoice } from '@/features/config/referenceChoices'

export { CheckedNames } from '@/components/config/CheckedNames'

export function Advanced({
  summary = 'Advanced',
  children,
}: {
  summary?: string
  children: ReactNode
}) {
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium">{summary}</summary>
      <div className="mt-3 grid gap-3">{children}</div>
    </details>
  )
}

function shown(value: number, scale: number): string {
  return String(Math.round(value * 10_000) / 10_000 / scale)
}

function useNumberText(value: number, scale: number) {
  const [raw, setRaw] = useState(shown(value, scale))
  useEffect(() => {
    if (raw.trim() !== '' && Math.abs(Number(raw) * scale - value) > 1e-6)
      setRaw(shown(value, scale))
  }, [value, scale, raw])
  return [raw, setRaw] as const
}

function ScaledInput({
  label,
  hint,
  value,
  scale,
  places,
  prefix,
  suffix,
  action,
  onValue,
}: {
  label: string
  hint?: string | undefined
  value: number
  scale: number
  places: number
  prefix?: string
  suffix?: string
  action?: ReactNode
  onValue: (next: number) => void
}) {
  const [raw, setRaw] = useNumberText(value, scale)
  const { controlId, hintId } = useFieldIds(undefined, hint)
  const factor = 10 ** places
  return (
    <Field label={label} htmlFor={controlId} hint={hint} hintId={hintId} required>
      <div className="flex items-center gap-2">
        {prefix === undefined ? null : <span aria-hidden="true">{prefix}</span>}
        <BareInput
          id={controlId}
          aria-describedby={hintId}
          type="number"
          required
          inputMode="decimal"
          min={0}
          step={1 / (scale * factor)}
          value={raw}
          className="max-w-40"
          onChange={(e) => {
            setRaw(e.target.value)
            const parsed = Number(e.target.value)
            if (e.target.value.trim() === '' || Number.isNaN(parsed)) return
            onValue(Math.round(parsed * scale * factor) / factor)
          }}
        />
        {suffix === undefined ? null : <span>{suffix}</span>}
        {action}
      </div>
    </Field>
  )
}

export function DollarsInput({
  label,
  hint,
  cents,
  onCents,
  fractionOfCent = false,
  action,
}: {
  label: string
  hint?: string
  cents: number
  onCents: (next: number) => void
  fractionOfCent?: boolean
  action?: ReactNode
}) {
  return (
    <ScaledInput
      label={label}
      hint={hint}
      action={action}
      value={cents}
      scale={100}
      places={fractionOfCent ? 2 : 0}
      prefix="$"
      onValue={onCents}
    />
  )
}

export function PercentInput({
  label,
  hint,
  basisPoints,
  onBasisPoints,
}: {
  label: string
  hint?: string
  basisPoints: number
  onBasisPoints: (next: number) => void
}) {
  return (
    <ScaledInput
      label={label}
      hint={hint}
      value={basisPoints}
      scale={100}
      places={0}
      suffix="percent"
      onValue={onBasisPoints}
    />
  )
}

export function NamePicker({
  label,
  hint,
  value,
  choices,
  onChange,
  emptyLabel = 'Choose one',
  required,
}: {
  label: string
  hint?: string
  required?: boolean
  value: string
  choices: readonly NamedChoice[]
  onChange: (key: string) => void
  emptyLabel?: string
}) {
  const known = choices.some((c) => c.key === value)
  const options: [string, string][] = [
    ...(known ? [] : ([[value, emptyLabel]] as [string, string][])),
    ...choices.map((c): [string, string] => [
      c.key,
      c.note === undefined ? c.label : `${c.label} (${c.note})`,
    ]),
  ]
  return (
    <Pick
      label={label}
      hint={hint}
      required={required}
      value={value}
      options={options}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function filled(list: readonly string[]): string[] {
  return list.filter((v) => v.trim() !== '')
}

export function TextRows({
  legend,
  hint,
  rowLabel,
  addLabel,
  values,
  onChange,
  max,
}: {
  legend: string
  hint?: string
  rowLabel: string
  addLabel: string
  values: readonly string[]
  onChange: (next: string[]) => void
  max?: number
}) {
  const [rows, setRows] = useState<string[]>([...values])
  useEffect(() => {
    if (filled(rows).join('\n') !== filled(values).join('\n')) setRows([...values])
  }, [rows, values])
  const change = (next: string[]) => {
    setRows(next)
    onChange(filled(next))
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {hint === undefined ? null : <p className="m-0 text-sm text-muted-foreground">{hint}</p>}
      {rows.map((value, index) => (
        <Input
          key={`row-${String(index)}`}
          label={`${rowLabel} ${String(index + 1)}`}
          value={value}
          onChange={(e) => change(rows.map((v, i) => (i === index ? e.target.value : v)))}
          action={
            <RowButton onClick={() => change(rows.filter((_, i) => i !== index))}>Remove</RowButton>
          }
        />
      ))}
      {max !== undefined && rows.length >= max ? null : (
        <div>
          <RowButton onClick={() => change([...rows, ''])}>{addLabel}</RowButton>
        </div>
      )}
    </fieldset>
  )
}
