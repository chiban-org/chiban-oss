'use client'

import { Input, Pick, RowButton, rowKey } from '@/components/config/primitives'
import type { FeeBase, FeeLineModel } from '@/features/fees/feeEditorModel'

const BASES = [
  ['flat', 'Flat amount'],
  ['per_unit', 'Per unit of a form field'],
  ['tiered', 'Tiered table'],
] as const

export function defaultBase(kind: string): FeeBase {
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

export function BaseEditor({
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
            <div key={rowKey('row', i)} className="grid grid-cols-3 gap-2">
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
            <div key={rowKey('tier', i)} className="grid grid-cols-3 gap-2">
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
