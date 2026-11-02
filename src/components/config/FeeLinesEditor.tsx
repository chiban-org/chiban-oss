'use client'

import { useState } from 'react'
import { BaseEditor } from '@/components/config/FeeBaseEditor'
import {
  Area,
  Check,
  type FieldErrors,
  FieldGroup,
  Input,
  Pick,
  RowButton,
  rowKey,
} from '@/components/config/primitives'
import {
  buildExpr,
  type FeeBase,
  type FeeLineModel,
  parseLine,
} from '@/features/fees/feeEditorModel'
import { FEE_STAGES, type FeeScheduleBody } from '@/features/fees/feeSchema'

type Line = FeeScheduleBody['lines'][number]

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
          key={rowKey('line', i)}
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
