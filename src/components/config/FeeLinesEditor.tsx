'use client'

import { useState } from 'react'

import { useEditorContext } from '@/components/config/EditorContextProvider'
import { BaseEditor } from '@/components/config/FeeBaseEditor'
import { FeeExample } from '@/components/config/fees/FeeExample'
import { Advanced, DollarsInput } from '@/components/config/plainFields'
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
import type { NamedChoice } from '@/features/config/referenceChoices'
import { buildExpr, type FeeLineModel, parseLine } from '@/features/fees/feeEditorModel'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { uniqueKey } from '@/features/forms/fieldKeys'

type Line = FeeScheduleBody['lines'][number]

export const DUE_OPTIONS = [
  ['at_intake', 'When the application is submitted'],
  ['at_approval', 'When the application is approved'],
  ['at_renewal', 'When the permit is renewed'],
  ['at_notice', 'When the abutter notice list is issued'],
] as const

const NO_QUESTIONS: NamedChoice[] = []

function ModelFields({
  model,
  questions,
  onChange,
}: {
  model: FeeLineModel
  questions: readonly NamedChoice[]
  onChange: (m: FeeLineModel) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Name on the bill"
          value={model.label}
          onChange={(e) => onChange({ ...model, label: e.target.value })}
        />
        <Pick
          label="Charged"
          value={model.due}
          options={DUE_OPTIONS}
          onChange={(e) => onChange({ ...model, due: e.target.value as FeeLineModel['due'] })}
        />
      </div>
      <BaseEditor model={model} questions={questions} onChange={onChange} />
      <Check
        label="Charge at least a minimum amount"
        checked={model.minimumCents !== null}
        onChange={(checked) => onChange({ ...model, minimumCents: checked ? 0 : null })}
      />
      {model.minimumCents === null ? null : (
        <DollarsInput
          label="Minimum"
          cents={model.minimumCents}
          onCents={(minimumCents) => onChange({ ...model, minimumCents })}
        />
      )}
      <Check
        label="Charge more when work started before the permit was issued"
        checked={model.multiplier !== null}
        onChange={(checked) => onChange({ ...model, multiplier: checked ? { factor: 2 } : null })}
      />
      {model.multiplier === null ? null : (
        <Input
          label="Multiply the fee by"
          hint="2 doubles the fee. The applicant says on the form whether work has started."
          type="number"
          min={1}
          step="0.5"
          value={model.multiplier.factor}
          onChange={(e) => onChange({ ...model, multiplier: { factor: Number(e.target.value) } })}
        />
      )}
    </div>
  )
}

function JsonField({ line, onChange }: { line: Line; onChange: (l: Line) => void }) {
  return (
    <Area
      label="The whole fee written as data"
      hint="For formulas the fields above cannot show. Changes apply only when the text is complete."
      rows={10}
      defaultValue={JSON.stringify(line, null, 2)}
      onChange={(e) => {
        try {
          onChange(JSON.parse(e.target.value) as Line)
        } catch {
          return
        }
      }}
    />
  )
}

function LineEditor({
  line,
  questions,
  onChange,
  onRemove,
}: {
  line: Line
  questions: readonly NamedChoice[]
  onChange: (l: Line) => void
  onRemove: () => void
}) {
  const [asData, setAsData] = useState(false)
  const model = parseLine(line)
  const fields = model !== null && !asData
  return (
    <div
      className="my-3 grid gap-3 rounded-md border border-hairline p-3"
      data-fee-line={line.code}
    >
      {fields ? (
        <>
          <ModelFields
            model={model}
            questions={questions}
            onChange={(m) =>
              onChange({ code: m.code, label: m.label, due: m.due, expr: buildExpr(m) })
            }
          />
          <FeeExample line={line} model={model} questions={questions} />
        </>
      ) : (
        <p className="m-0 text-sm">
          {model === null
            ? `${line.label}: this fee uses a formula the fields here cannot show. It can be changed as data under Advanced.`
            : `${line.label} is being changed as data under Advanced.`}
        </p>
      )}
      <Advanced>
        <Input
          label="Fee code"
          hint="Receipts and fee waivers refer to this fee by its code. Keep it once the fee has been charged."
          value={line.code}
          onChange={(e) => onChange({ ...line, code: e.target.value })}
        />
        {fields ? null : <JsonField line={line} onChange={onChange} />}
        {model === null ? null : (
          <div>
            <RowButton onClick={() => setAsData(!asData)}>
              {asData ? 'Use the fields above' : 'Change the fee as data'}
            </RowButton>
          </div>
        )}
      </Advanced>
      <div>
        <RowButton onClick={onRemove}>Remove this fee</RowButton>
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
  const questions = useEditorContext().feeQuestions ?? NO_QUESTIONS
  return (
    <>
      <Input
        label="Name"
        hint="Leave empty to name it after the application type that uses it."
        value={body.label ?? ''}
        onChange={(e) =>
          onChange({ ...body, label: e.target.value === '' ? undefined : e.target.value })
        }
      />
      <FieldGroup name="lines" label="Fees" errors={errors}>
        {questions.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            No application type uses this fee schedule yet, so there are no form questions to count.
            Choose this schedule on an application type to pick from its questions.
          </p>
        ) : null}
        {body.lines.map((line, i) => (
          <LineEditor
            key={rowKey('line', i)}
            line={line}
            questions={questions}
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
                  code: uniqueKey('fee', new Set(body.lines.map((l) => l.code))),
                  label: 'New fee',
                  due: 'at_approval',
                  expr: { op: 'flat', cents: 0 },
                },
              ],
            })
          }
        >
          Add a fee
        </RowButton>
      </FieldGroup>
    </>
  )
}
