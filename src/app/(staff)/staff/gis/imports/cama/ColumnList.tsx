'use client'

import { Button } from '@/components/ui/button'

interface ColumnListProps {
  label: string
  columns: string[]
  headers: string[]
  onChange: (columns: string[]) => void
  maxColumns: number
}

const EMPTY_CHOICE = ''

export function ColumnList({ label, columns, headers, onChange, maxColumns }: ColumnListProps) {
  const options = [...new Set([...headers, ...columns])]
  const replaceAt = (index: number, value: string) =>
    onChange(columns.map((c, i) => (i === index ? value : c)))
  return (
    <fieldset className="my-3">
      <legend className="text-sm font-medium">{label}</legend>
      {columns.map((column, index) => (
        <div key={`${label}-${index.toString()}`} className="mt-1 flex items-center gap-2">
          <select
            aria-label={`${label} column ${index + 1}`}
            value={column}
            onChange={(e) => replaceAt(index, e.target.value)}
            className="block rounded-md border bg-surface px-3 py-2 text-sm"
          >
            <option value={EMPTY_CHOICE}>Choose a column</option>
            {options.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          {columns.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(columns.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      {columns.length < maxColumns ? (
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => onChange([...columns, EMPTY_CHOICE])}
        >
          Add a column
        </Button>
      ) : null}
    </fieldset>
  )
}
