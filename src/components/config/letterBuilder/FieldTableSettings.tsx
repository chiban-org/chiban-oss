'use client'

import { Input, Pick, RowButton, rowKey } from '@/components/config/primitives'
import { moveItem } from '@/features/forms/formEdits'
import type { FieldTableRow } from '@/features/templates/doc/docSchema'

interface Props {
  rows: FieldTableRow[]
  fieldOptions: readonly (readonly [string, string])[]
  onChange: (rows: FieldTableRow[]) => void
}

export function FieldTableSettings({ rows, fieldOptions, onChange }: Props) {
  const update = (i: number, patch: Partial<FieldTableRow>) =>
    onChange(rows.map((row, n) => (n === i ? { ...row, ...patch } : row)))
  return (
    <div className="grid gap-3">
      <ol className="m-0 grid list-none gap-3 p-0">
        {rows.map((row, i) => (
          <li key={rowKey('row', i)} className="grid gap-2 border-b border-hairline pb-3">
            <Input
              label={`Row ${i + 1} label`}
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <Pick
              label={`Row ${i + 1} shows`}
              value={row.field}
              options={fieldOptions}
              onChange={(e) => update(i, { field: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              {i === 0 ? null : (
                <RowButton onClick={() => onChange([...moveItem(rows, i, i - 1)])}>
                  Move up
                </RowButton>
              )}
              {i === rows.length - 1 ? null : (
                <RowButton onClick={() => onChange([...moveItem(rows, i, i + 1)])}>
                  Move down
                </RowButton>
              )}
              <RowButton onClick={() => onChange(rows.filter((_, n) => n !== i))}>
                Remove row
              </RowButton>
            </div>
          </li>
        ))}
      </ol>
      <RowButton
        onClick={() =>
          onChange([...rows, { label: 'Label', field: fieldOptions[0]?.[0] ?? 'town.name' }])
        }
      >
        Add row
      </RowButton>
    </div>
  )
}
