'use client'

import { useState } from 'react'
import {
  Area,
  Check,
  type FieldErrors,
  FieldGroup,
  Input,
  Pick,
  RowButton,
} from '@/components/config/primitives'
import {
  buildExpr,
  type FeeBase,
  type FeeLineModel,
  parseLine,
} from '@/features/fees/feeEditorModel'
import { FEE_STAGES, type FeeScheduleBody } from '@/features/fees/feeSchema'

type Line = FeeScheduleBody['lines'][number]

const BASES = [
  ['flat', 'Flat amount'],
  ['per_unit', 'Per unit of a form field'],
  ['tiered', 'Tiered table'],
] as const

function defaultBase(kind: string): FeeBase {
  if (kind === 'flat') return { kind: 'flat', cents: 0 }
  if (kind === 'tiered')
    return {
      kind: 'tiered',
      field: '',
      mode: 'graduated',
      tiers: [{ upTo: null, centsPerUnit: 0 }],
    }
  return { kind: 'per_unit', rows: [{ field: '', centsPerUnit: 0 }] }
}

function BaseEditor({
  model,
  onChange,
}: {
  model: FeeLineModel
  onChange: (m: FeeLineModel) => void
}) {
  const { base } = model
  return (
    <div>
      <Pick
        label="Calculation"
        value={base.kind}
        options={BASES}
        onChange={(e) => onChange({ ...model, base: defaultBase(e.target.value) })}
      />
      {base.kind === 'flat' ? (
        <Input
          label="Amount in cents"
          type="number"
          value={base.cents}
          onChange={(e) =>
            onChange({ ...model, base: { kind: 'flat', cents: Number(e.target.value) } })
          }
        />
      ) : null}
      {base.kind === 'per_unit'
        ? base.rows.map((row, i) => (
            <div key={`${row.field}-${i}`} className="grid grid-cols-3 gap-2">
              <Input
                label="Form field"
                value={row.field}
                onChange={(e) =>
                  onChange({
                    ...model,
                    base: {
                      kind: 'per_unit',
                      rows: base.rows.map((r, n) =>
                        n === i ? { ...r, field: e.target.value } : r,
                      ),
                    },
                  })
                }
              />
              <Input
                label="Cents per unit"
                type="number"
                value={row.centsPerUnit}
                onChange={(e) =>
                  onChange({
                    ...model,
                    base: {
                      kind: 'per_unit',
                      rows: base.rows.map((r, n) =>
                        n === i ? { ...r, centsPerUnit: Number(e.target.value) } : r,
                      ),
                    },
                  })
                }
              />
              <RowButton
                onClick={() =>
                  onChange({
                    ...model,
                    base: { kind: 'per_unit', rows: base.rows.filter((_, n) => n !== i) },
                  })
                }
              >
                Remove row
              </RowButton>
            </div>
          ))
        : null}
      {base.kind === 'per_unit' ? (
        <RowButton
          onClick={() =>
            onChange({
              ...model,
              base: { kind: 'per_unit', rows: [...base.rows, { field: '', centsPerUnit: 0 }] },
            })
          }
        >
          Add row
        </RowButton>
      ) : null}
      {base.kind === 'tiered' ? (
        <>
          <Input
            label="Form field"
            value={base.field}
            onChange={(e) => onChange({ ...model, base: { ...base, field: e.target.value } })}
          />
          <Pick
            label="Tier mode"
            value={base.mode}
            options={[
              ['graduated', 'Each slice at its own rate'],
              ['bracket', 'Whole quantity at the tier rate'],
            ]}
            onChange={(e) =>
              onChange({
                ...model,
                base: { ...base, mode: e.target.value as 'graduated' | 'bracket' },
              })
            }
          />
          {base.tiers.map((tier, i) => (
            <div key={`tier-${i}`} className="grid grid-cols-3 gap-2">
              <Input
                label="Up to (blank for the rest)"
                type="number"
                value={tier.upTo ?? ''}
                onChange={(e) =>
                  onChange({
                    ...model,
                    base: {
                      ...base,
                      tiers: base.tiers.map((t, n) =>
                        n === i
                          ? { ...t, upTo: e.target.value === '' ? null : Number(e.target.value) }
                          : t,
                      ),
                    },
                  })
                }
              />
              <Input
                label="Cents per unit"
                type="number"
                value={tier.centsPerUnit ?? 0}
                onChange={(e) =>
                  onChange({
                    ...model,
                    base: {
                      ...base,
                      tiers: base.tiers.map((t, n) =>
                        n === i ? { ...t, centsPerUnit: Number(e.target.value) } : t,
                      ),
                    },
                  })
                }
              />
              <RowButton
                onClick={() =>
                  onChange({
                    ...model,
                    base: { ...base, tiers: base.tiers.filter((_, n) => n !== i) },
                  })
                }
              >
                Remove tier
              </RowButton>
            </div>
          ))}
          <RowButton
            onClick={() =>
              onChange({
                ...model,
                base: { ...base, tiers: [...base.tiers, { upTo: null, centsPerUnit: 0 }] },
              })
            }
          >
            Add tier
          </RowButton>
        </>
      ) : null}
    </div>
  )
}

function ModelEditor({
  model,
  onChange,
}: {
  model: FeeLineModel
  onChange: (m: FeeLineModel) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Input
          label="Code"
          value={model.code}
          onChange={(e) => onChange({ ...model, code: e.target.value })}
        />
        <Input
          label="Label"
          value={model.label}
          onChange={(e) => onChange({ ...model, label: e.target.value })}
        />
        <Pick
          label="Due"
          value={model.due}
          options={FEE_STAGES.map((s): [string, string] => [s, s.replaceAll('_', ' ')])}
          onChange={(e) => onChange({ ...model, due: e.target.value as FeeLineModel['due'] })}
        />
      </div>
      <BaseEditor model={model} onChange={onChange} />
      <Check
        label="Apply a minimum"
        checked={model.minimumCents !== null}
        onChange={(e) => onChange({ ...model, minimumCents: e.target.checked ? 0 : null })}
      />
      {model.minimumCents === null ? null : (
        <Input
          label="Minimum in cents"
          type="number"
          value={model.minimumCents}
          onChange={(e) => onChange({ ...model, minimumCents: Number(e.target.value) })}
        />
      )}
      <Check
        label="Multiply when work started before the permit"
        checked={model.multiplier !== null}
        onChange={(e) =>
          onChange({ ...model, multiplier: e.target.checked ? { factor: 2 } : null })
        }
      />
      {model.multiplier === null ? null : (
        <Input
          label="Multiplier"
          type="number"
          step="0.5"
          value={model.multiplier.factor}
          onChange={(e) => onChange({ ...model, multiplier: { factor: Number(e.target.value) } })}
        />
      )}
    </div>
  )
}

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: Line
  onChange: (l: Line) => void
  onRemove: () => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const model = parseLine(line)
  const raw = JSON.stringify(line, null, 2)
  return (
    <div className="my-3 rounded-md border p-3" data-fee-line={line.code}>
      {model === null || advanced ? (
        <Area
          label={`Fee line ${line.code} as JSON (this expression has no table form)`}
          rows={10}
          defaultValue={raw}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value) as Line)
            } catch {
              return
            }
          }}
        />
      ) : (
        <ModelEditor
          model={model}
          onChange={(m) =>
            onChange({ code: m.code, label: m.label, due: m.due, expr: buildExpr(m) })
          }
        />
      )}
      <div className="mt-2 flex gap-2">
        {model === null ? null : (
          <RowButton onClick={() => setAdvanced(!advanced)}>
            {advanced ? 'Use the table' : 'Edit as JSON'}
          </RowButton>
        )}
        <RowButton onClick={onRemove}>Remove line</RowButton>
      </div>
    </div>
  )
}

export function FeeLinesEditor({
  body,
  onChange,
  errors,
}: {
  body: FeeScheduleBody
  onChange: (b: FeeScheduleBody) => void
  errors: FieldErrors
}) {
  return (
    <FieldGroup name="lines" label="Fee lines" errors={errors}>
      {body.lines.map((line, i) => (
        <LineEditor
          key={`${line.code}-${i}`}
          line={line}
          onChange={(next) =>
            onChange({ ...body, lines: body.lines.map((l, n) => (n === i ? next : l)) })
          }
          onRemove={() => onChange({ ...body, lines: body.lines.filter((_, n) => n !== i) })}
        />
      ))}
      <RowButton
        onClick={() =>
          onChange({
            ...body,
            lines: [
              ...body.lines,
              {
                code: `fee_${body.lines.length + 1}`,
                label: 'New fee',
                due: 'at_approval',
                expr: { op: 'flat', cents: 0 },
              },
            ],
          })
        }
      >
        Add fee line
      </RowButton>
    </FieldGroup>
  )
}
