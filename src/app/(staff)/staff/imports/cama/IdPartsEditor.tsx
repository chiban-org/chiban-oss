'use client'

import { Button } from '@/components/ui/button'
import type { CamaIdPart } from '@/features/cama/mapping'

interface IdPartsEditorProps {
  parts: CamaIdPart[]
  headers: string[]
  onChange: (parts: CamaIdPart[]) => void
}

const FIXED_DIGITS = '__fixed__'
const DEFAULT_WIDTH = 3

function selectionOf(part: CamaIdPart): string {
  return 'column' in part ? part.column : FIXED_DIGITS
}

export function IdPartsEditor({ parts, headers, onChange }: IdPartsEditorProps) {
  const replaceAt = (index: number, part: CamaIdPart) =>
    onChange(parts.map((p, i) => (i === index ? part : p)))
  const choose = (index: number, value: string) =>
    replaceAt(
      index,
      value === FIXED_DIGITS ? { literal: '000' } : { column: value, width: DEFAULT_WIDTH },
    )
  return (
    <fieldset className="my-3">
      <legend className="text-sm font-medium">Parcel ID parts, in order</legend>
      {parts.map((part, index) => {
        const options = [...new Set([...headers, ...('column' in part ? [part.column] : [])])]
        return (
          <div key={`part-${index.toString()}`} className="mt-1 flex flex-wrap items-center gap-2">
            <select
              aria-label={`ID part ${index + 1} source`}
              value={selectionOf(part)}
              onChange={(e) => choose(index, e.target.value)}
              className="block rounded-md border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Choose a column</option>
              {options.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
              <option value={FIXED_DIGITS}>Fixed digits</option>
            </select>
            {'column' in part ? (
              <label className="text-sm">
                Width
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={part.width}
                  onChange={(e) =>
                    replaceAt(index, { column: part.column, width: Number(e.target.value) })
                  }
                  className="ml-2 w-20 rounded-md border bg-surface px-2 py-2 text-sm"
                />
              </label>
            ) : (
              <label className="text-sm">
                Digits
                <input
                  value={part.literal}
                  onChange={(e) => replaceAt(index, { literal: e.target.value })}
                  className="ml-2 w-24 rounded-md border bg-surface px-2 py-2 text-sm"
                />
              </label>
            )}
            {parts.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(parts.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            ) : null}
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        className="mt-2"
        onClick={() => onChange([...parts, { column: '', width: DEFAULT_WIDTH }])}
      >
        Add a part
      </Button>
    </fieldset>
  )
}
