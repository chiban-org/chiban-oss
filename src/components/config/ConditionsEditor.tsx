'use client'

import { Advanced } from '@/components/config/plainFields'
import {
  Area,
  Check,
  type FieldErrors,
  FieldGroup,
  Input,
  RowButton,
  rowKey,
} from '@/components/config/primitives'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import { uniqueKey } from '@/features/forms/fieldKeys'

type Condition = ConditionLibraryBody['conditions'][number]

export function newConditionCode(conditions: readonly Condition[]): string {
  const taken = new Set(conditions.map((c) => c.code))
  let n = conditions.length + 1
  while (taken.has(`C${String(n)}`)) n += 1
  return uniqueKey(`C${String(n)}`, taken)
}

export function ConditionsEditor({
  body,
  onChange,
  errors,
}: {
  body: ConditionLibraryBody
  onChange: (next: ConditionLibraryBody) => void
  errors: FieldErrors
}) {
  const setRow = (i: number, patch: Partial<Condition>) =>
    onChange({
      ...body,
      conditions: body.conditions.map((x, n) => (n === i ? { ...x, ...patch } : x)),
    })
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
      <FieldGroup name="conditions" label="Conditions" errors={errors}>
        <p className="m-0 text-sm text-muted-foreground">
          Staff pick from these when they approve an application, and each one picked is printed on
          the decision.
        </p>
        {body.conditions.map((c, i) => (
          <div
            key={rowKey('condition', i)}
            className="my-3 grid gap-2 border-b border-hairline pb-3"
          >
            <Area
              label={`Condition ${String(i + 1)}`}
              rows={2}
              value={c.text}
              onChange={(e) => setRow(i, { text: e.target.value })}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Check
                label="Must be met before the permit is issued"
                checked={c.blocksIssuance}
                onChange={(checked) => setRow(i, { blocksIssuance: checked })}
              />
              <RowButton
                onClick={() =>
                  onChange({ ...body, conditions: body.conditions.filter((_, n) => n !== i) })
                }
              >
                Remove
              </RowButton>
            </div>
            <Advanced>
              <Input
                label="Code"
                hint="A short code that marks this condition on decisions, such as C3."
                value={c.code}
                onChange={(e) => setRow(i, { code: e.target.value })}
              />
            </Advanced>
          </div>
        ))}
        <RowButton
          onClick={() =>
            onChange({
              ...body,
              conditions: [
                ...body.conditions,
                { code: newConditionCode(body.conditions), text: '', blocksIssuance: false },
              ],
            })
          }
        >
          Add a condition
        </RowButton>
      </FieldGroup>
    </>
  )
}
