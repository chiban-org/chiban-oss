'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Legend } from '@/components/ui/legend'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
      <Legend>Parcel ID parts, in order</Legend>
      {parts.map((part, index) => {
        const options = [...new Set([...headers, ...('column' in part ? [part.column] : [])])]
        return (
          <div key={`part-${index.toString()}`} className="mt-2 flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label={`ID part ${index + 1} source`}
              value={selectionOf(part)}
              onChange={(e) => choose(index, e.target.value)}
              wrapperClassName="w-auto"
            >
              <NativeSelectOption value="">Choose a column</NativeSelectOption>
              {options.map((h) => (
                <NativeSelectOption key={h} value={h}>
                  {h}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={FIXED_DIGITS}>Fixed digits</NativeSelectOption>
            </NativeSelect>
            {'column' in part ? (
              <Label className="font-normal">
                Width
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={part.width}
                  onChange={(e) =>
                    replaceAt(index, { column: part.column, width: Number(e.target.value) })
                  }
                  className="w-20"
                />
              </Label>
            ) : (
              <Label className="font-normal">
                Digits
                <Input
                  value={part.literal}
                  onChange={(e) => replaceAt(index, { literal: e.target.value })}
                  className="w-24"
                />
              </Label>
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
