'use client'

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
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import type { LocalCodeAmendmentBody } from '@/features/config/kinds'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'
import type { TemplateBody } from '@/features/templates/templateSchema'

interface EditorProps<T> {
  body: T
  onChange: (next: T) => void
  errors: FieldErrors
}

export function TemplateEditor({
  body,
  onChange,
  errors,
  mergeFields,
}: EditorProps<TemplateBody> & { mergeFields: string[] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Label"
          value={body.label}
          onChange={(e) => onChange({ ...body, label: e.target.value })}
        />
        <Pick
          label="Kind"
          value={body.kind}
          options={[
            ['permit', 'Permit'],
            ['placard', 'Placard'],
            ['letter', 'Letter'],
          ]}
          onChange={(e) => onChange({ ...body, kind: e.target.value as 'permit' })}
        />
      </div>
      <FieldGroup name="body" label="Template text" errors={errors}>
        <Area
          label="Text with merge fields"
          rows={8}
          value={body.body}
          onChange={(e) => onChange({ ...body, body: e.target.value })}
        />
        <p className="mt-2 text-sm">Insert a merge field:</p>
        <div className="flex flex-wrap gap-2">
          {mergeFields.map((field) => (
            <RowButton
              key={field}
              onClick={() => onChange({ ...body, body: `${body.body}{{${field}}}` })}
            >
              {field}
            </RowButton>
          ))}
        </div>
      </FieldGroup>
    </>
  )
}

export function ConditionsEditor({ body, onChange, errors }: EditorProps<ConditionLibraryBody>) {
  return (
    <FieldGroup name="conditions" label="Conditions" errors={errors}>
      {body.conditions.map((c, i) => (
        <div
          key={rowKey('condition', i)}
          className="my-2 grid grid-cols-[8rem_1fr_auto_auto] items-end gap-2"
        >
          <Input
            label="Code"
            value={c.code}
            onChange={(e) =>
              onChange({
                ...body,
                conditions: body.conditions.map((x, n) =>
                  n === i ? { ...x, code: e.target.value } : x,
                ),
              })
            }
          />
          <Input
            label="Text"
            value={c.text}
            onChange={(e) =>
              onChange({
                ...body,
                conditions: body.conditions.map((x, n) =>
                  n === i ? { ...x, text: e.target.value } : x,
                ),
              })
            }
          />
          <Check
            label="Blocks issuance"
            checked={c.blocksIssuance}
            onChange={(e) =>
              onChange({
                ...body,
                conditions: body.conditions.map((x, n) =>
                  n === i ? { ...x, blocksIssuance: e.target.checked } : x,
                ),
              })
            }
          />
          <RowButton
            onClick={() =>
              onChange({ ...body, conditions: body.conditions.filter((_, n) => n !== i) })
            }
          >
            Remove
          </RowButton>
        </div>
      ))}
      <RowButton
        onClick={() =>
          onChange({
            ...body,
            conditions: [
              ...body.conditions,
              { code: `CODE${body.conditions.length + 1}`, text: '', blocksIssuance: false },
            ],
          })
        }
      >
        Add condition
      </RowButton>
    </FieldGroup>
  )
}

export function ChecklistEditor({ body, onChange, errors }: EditorProps<ChecklistBody>) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Label"
          value={body.label}
          onChange={(e) => onChange({ ...body, label: e.target.value })}
        />
        <Input
          label="Inspection type"
          value={body.inspectionType}
          onChange={(e) => onChange({ ...body, inspectionType: e.target.value })}
        />
      </div>
      <FieldGroup name="items" label="Checklist items" errors={errors}>
        {body.items.map((item, i) => (
          <div
            key={rowKey('item', i)}
            className="my-2 grid grid-cols-[8rem_1fr_auto_auto] items-end gap-2"
          >
            <Input
              label="Key"
              value={item.key}
              onChange={(e) =>
                onChange({
                  ...body,
                  items: body.items.map((x, n) => (n === i ? { ...x, key: e.target.value } : x)),
                })
              }
            />
            <Input
              label="Item"
              value={item.label}
              onChange={(e) =>
                onChange({
                  ...body,
                  items: body.items.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)),
                })
              }
            />
            <Check
              label="Required"
              checked={item.required}
              onChange={(e) =>
                onChange({
                  ...body,
                  items: body.items.map((x, n) =>
                    n === i ? { ...x, required: e.target.checked } : x,
                  ),
                })
              }
            />
            <RowButton
              onClick={() => onChange({ ...body, items: body.items.filter((_, n) => n !== i) })}
            >
              Remove
            </RowButton>
          </div>
        ))}
        <RowButton
          onClick={() =>
            onChange({
              ...body,
              items: [
                ...body.items,
                { key: `item-${body.items.length + 1}`, label: '', required: true },
              ],
            })
          }
        >
          Add item
        </RowButton>
      </FieldGroup>
    </>
  )
}

export function LocalAmendmentEditor({
  body,
  onChange,
}: Omit<EditorProps<LocalCodeAmendmentBody>, 'errors'>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Input
        label="Title"
        value={body.title}
        onChange={(e) => onChange({ ...body, title: e.target.value })}
      />
      <Input
        label="Code section"
        value={body.codeSection}
        onChange={(e) => onChange({ ...body, codeSection: e.target.value })}
      />
      <Input
        label="Adopting authority"
        value={body.adoptingAuthority}
        onChange={(e) => onChange({ ...body, adoptingAuthority: e.target.value })}
      />
      <Input
        label="Adopted on"
        type="date"
        value={body.adoptedOn}
        onChange={(e) => onChange({ ...body, adoptedOn: e.target.value as typeof body.adoptedOn })}
      />
      <Input
        label="Confirmed by the building code review board on"
        type="date"
        value={body.reviewBoardConfirmedOn ?? ''}
        onChange={(e) =>
          onChange({
            ...body,
            reviewBoardConfirmedOn:
              e.target.value === '' ? null : (e.target.value as typeof body.adoptedOn),
          })
        }
      />
    </div>
  )
}
