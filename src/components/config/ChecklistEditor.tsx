'use client'

import { Advanced } from '@/components/config/plainFields'
import {
  Check,
  FieldError,
  type FieldErrors,
  FieldGroup,
  Input,
  RowButton,
  rowKey,
} from '@/components/config/primitives'
import { uniqueKey } from '@/features/forms/fieldKeys'
import { type ChecklistBody, isFinalChecklist } from '@/features/inspections/checklistSchema'

type Item = ChecklistBody['items'][number]

function spokenType(inspectionType: string): string {
  const spaced = (inspectionType || 'final').replace(/[_-]+/g, ' ').trim()
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
}

export function ChecklistEditor({
  body,
  onChange,
  errors,
}: {
  body: ChecklistBody
  onChange: (next: ChecklistBody) => void
  errors: FieldErrors
}) {
  const setItem = (i: number, patch: Partial<Item>) =>
    onChange({ ...body, items: body.items.map((x, n) => (n === i ? { ...x, ...patch } : x)) })
  return (
    <>
      <div className="grid gap-3">
        <Input
          label="Name"
          hint="What inspectors and staff see, for example Footing inspection."
          value={body.label}
          onChange={(e) => onChange({ ...body, label: e.target.value })}
        />
        <Check
          label="This is the final inspection, which can close the permit"
          checked={isFinalChecklist(body)}
          onChange={(checked) => onChange({ ...body, final: checked })}
        />
      </div>
      <FieldGroup name="items" label="What the inspector checks" errors={errors}>
        {body.items.map((item, i) => (
          <div key={rowKey('item', i)} className="my-3 grid gap-2 border-b border-hairline pb-3">
            <Input
              label={`Check ${String(i + 1)}`}
              value={item.label}
              onChange={(e) => setItem(i, { label: e.target.value })}
              action={
                <RowButton
                  onClick={() => onChange({ ...body, items: body.items.filter((_, n) => n !== i) })}
                >
                  Remove
                </RowButton>
              }
            />
            <Check
              label="Must pass for the inspection to pass"
              checked={item.required}
              onChange={(checked) => setItem(i, { required: checked })}
            />
            <Advanced>
              <Input
                label="Item key"
                hint="Inspection results are stored under this key. Keep it once inspections have used it."
                value={item.key}
                onChange={(e) => setItem(i, { key: e.target.value })}
              />
            </Advanced>
          </div>
        ))}
        <RowButton
          onClick={() =>
            onChange({
              ...body,
              items: [
                ...body.items,
                {
                  key: uniqueKey(
                    `item-${String(body.items.length + 1)}`,
                    new Set(body.items.map((x) => x.key)),
                  ),
                  label: '',
                  required: true,
                },
              ],
            })
          }
        >
          Add a check
        </RowButton>
      </FieldGroup>
      <Advanced>
        <Input
          label="Inspection type"
          hint={`Applicants and calendars show this as “${spokenType(body.inspectionType)} inspection”. Inspections already booked keep the type they were booked under.`}
          value={body.inspectionType}
          onChange={(e) => onChange({ ...body, inspectionType: e.target.value })}
        />
        <FieldError errors={errors} name="inspectionType" />
      </Advanced>
    </>
  )
}
