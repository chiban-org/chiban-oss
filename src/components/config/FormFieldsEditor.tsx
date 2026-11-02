'use client'

import {
  Check,
  type FieldErrors,
  FieldGroup,
  Input,
  Pick,
  RowButton,
  rowKey,
} from '@/components/config/primitives'
import { FIELD_TYPES, type FormBody, type FormField } from '@/features/forms/formSchema'

type Condition = NonNullable<FormField['showIf']>
type Leaf = Extract<Condition, { field: string }>

const OPS = ['equals', 'not_equals', 'in', 'is_true', 'is_false', 'gt', 'lt'] as const
const FACTS = [
  ['', 'None'],
  ['classification', 'Classification'],
  ['dwellingUnits', 'Dwelling units'],
  ['afterTheFact', 'After the fact'],
] as const

function displayValue(value: Leaf['value']): string {
  if (Array.isArray(value)) return value.join(', ')
  return value === undefined ? '' : String(value)
}

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

function leafOf(condition: Condition | undefined): Leaf | null {
  return condition !== undefined && 'field' in condition ? condition : null
}

function ConditionPicker({
  label,
  earlier,
  value,
  onChange,
}: {
  label: string
  earlier: string[]
  value: Condition | undefined
  onChange: (next: Condition | undefined) => void
}) {
  const leaf = leafOf(value)
  const set = (patch: Partial<Leaf>) =>
    onChange({ field: earlier[0] ?? '', op: 'equals', ...leaf, ...patch })
  return (
    <div className="grid grid-cols-3 gap-2">
      <Pick
        label={`${label}: field`}
        value={leaf?.field ?? ''}
        options={[['', 'Always'], ...earlier.map((k): [string, string] => [k, k])]}
        onChange={(e) =>
          e.target.value === '' ? onChange(undefined) : set({ field: e.target.value })
        }
      />
      <Pick
        label={`${label}: test`}
        value={leaf?.op ?? 'equals'}
        options={OPS.map((o): [string, string] => [o, o.replaceAll('_', ' ')])}
        onChange={(e) => {
          const op = e.target.value as Leaf['op']
          set({
            op,
            value: op === 'in' ? splitList(displayValue(leaf?.value)) : displayValue(leaf?.value),
          })
        }}
      />
      <Input
        label={`${label}: value`}
        value={displayValue(leaf?.value)}
        onChange={(e) =>
          set({ value: leaf?.op === 'in' ? splitList(e.target.value) : e.target.value })
        }
      />
    </div>
  )
}

export function FormFieldsEditor({
  body,
  onChange,
  errors,
}: {
  body: FormBody
  onChange: (next: FormBody) => void
  errors: FieldErrors
}) {
  const update = (index: number, patch: Partial<FormField>) =>
    onChange({ ...body, fields: body.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
  return (
    <>
      <Input
        label="Form label"
        value={body.label}
        onChange={(e) => onChange({ ...body, label: e.target.value })}
      />
      <FieldGroup name="fields" label="Fields" errors={errors}>
        {body.fields.map((field, i) => (
          <div
            key={rowKey('field', i)}
            className="my-3 rounded-md border p-3"
            data-field-row={field.key}
          >
            <div className="grid grid-cols-4 gap-2">
              <Input
                label="Key"
                value={field.key}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <Input
                label="Label"
                value={field.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Pick
                label="Type"
                value={field.type}
                options={FIELD_TYPES.map((t): [string, string] => [t, t])}
                onChange={(e) => update(i, { type: e.target.value as FormField['type'] })}
              />
              <Pick
                label="Fact"
                value={field.fact ?? ''}
                options={FACTS}
                onChange={(e) =>
                  update(i, {
                    fact: e.target.value === '' ? undefined : (e.target.value as FormField['fact']),
                  })
                }
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <Check
                label="Required"
                checked={field.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              <Check
                label="Staff only"
                checked={field.staffOnly === true}
                onChange={(e) => update(i, { staffOnly: e.target.checked })}
              />
              <Input
                label="Minimum"
                type="number"
                value={field.validation?.min ?? ''}
                onChange={(e) =>
                  update(i, {
                    validation: {
                      ...field.validation,
                      min: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  })
                }
              />
              <Input
                label="Maximum"
                type="number"
                value={field.validation?.max ?? ''}
                onChange={(e) =>
                  update(i, {
                    validation: {
                      ...field.validation,
                      max: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  })
                }
              />
              <RowButton
                onClick={() => onChange({ ...body, fields: body.fields.filter((_, n) => n !== i) })}
              >
                Remove field
              </RowButton>
            </div>
            {field.type === 'select' || field.type === 'multiselect' ? (
              <Input
                label="Options (value:label, comma separated)"
                value={(field.options ?? []).map((o) => `${o.value}:${o.label}`).join(', ')}
                onChange={(e) =>
                  update(i, {
                    options: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s !== '')
                      .map((s) => {
                        const [value = '', label = value] = s.split(':')
                        return { value: value.trim(), label: label.trim() }
                      }),
                  })
                }
              />
            ) : null}
            <ConditionPicker
              label="Show if"
              earlier={body.fields.slice(0, i).map((f) => f.key)}
              value={field.showIf}
              onChange={(next) => update(i, { showIf: next })}
            />
            <ConditionPicker
              label="Require if"
              earlier={body.fields.slice(0, i).map((f) => f.key)}
              value={field.requireIf}
              onChange={(next) => update(i, { requireIf: next })}
            />
          </div>
        ))}
        <RowButton
          onClick={() =>
            onChange({
              ...body,
              fields: [
                ...body.fields,
                {
                  key: `field_${body.fields.length + 1}`,
                  label: 'New field',
                  type: 'text',
                  required: false,
                },
              ],
            })
          }
        >
          Add field
        </RowButton>
      </FieldGroup>
    </>
  )
}
