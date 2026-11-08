'use client'

import { ConditionBuilder } from '@/components/config/formBuilder/ConditionBuilder'
import { Advanced } from '@/components/config/plainFields'
import {
  Area,
  Check,
  FieldError,
  type FieldErrors,
  FieldGroup,
  Input,
  Pick,
  RowButton,
  rowKey,
} from '@/components/config/primitives'
import { Button } from '@/components/ui/button'
import {
  DOCUMENT_STAGES,
  type DocumentItem,
  documentStageLabel,
} from '@/features/applications/documentItemSchema'
import { describeCondition } from '@/features/forms/conditionRules'
import { uniqueKey } from '@/features/forms/fieldKeys'
import { moveItem } from '@/features/forms/formEdits'
import type { FormField } from '@/features/forms/formSchema'

const STAGE_CHOICES = DOCUMENT_STAGES.map((s): [string, string] => [s, documentStageLabel(s)])

export function documentSummary(item: DocumentItem, fields: readonly FormField[]): string {
  const when =
    item.requiredIf === undefined ? '' : `, when ${describeCondition(item.requiredIf, fields)}`
  const optional = item.optional === true ? ', optional' : ''
  return `${item.label || 'Unnamed document'} (${documentStageLabel(item.stage)}${when}${optional})`
}

interface ItemEditorProps {
  item: DocumentItem
  index: number
  count: number
  fields: FormField[]
  errors: FieldErrors
  onChange: (patch: Partial<DocumentItem>) => void
  onMove: (to: number) => void
  onRemove: () => void
}

function ItemEditor({ item, index, count, fields, errors, ...on }: ItemEditorProps) {
  const path = `documents.${String(index)}`
  return (
    <details className="my-2 rounded-md border border-hairline p-3">
      <summary className="cursor-pointer font-medium">{documentSummary(item, fields)}</summary>
      <div className="mt-3 grid gap-3">
        <Input
          label="Document name"
          value={item.label}
          onChange={(e) => on.onChange({ label: e.target.value })}
          action={<RowButton onClick={on.onRemove}>Remove</RowButton>}
        />
        <FieldError errors={errors} name={`${path}.label`} />
        <Pick
          label="Needed"
          value={item.stage}
          options={STAGE_CHOICES}
          onChange={(e) => {
            const stage = DOCUMENT_STAGES.find((s) => s === e.target.value)
            if (stage !== undefined) on.onChange({ stage })
          }}
        />
        <FieldError errors={errors} name={`${path}.stage`} />
        <Area
          label="Help for the applicant"
          rows={2}
          value={item.help ?? ''}
          onChange={(e) =>
            on.onChange({ help: e.target.value === '' ? undefined : e.target.value })
          }
        />
        <ConditionBuilder
          title="Needed only when"
          fields={fields}
          index={fields.length}
          value={item.requiredIf}
          onChange={(requiredIf) => on.onChange({ requiredIf })}
        />
        <Check
          label="Optional: list it but do not hold the application for it"
          checked={item.optional === true}
          onChange={(optional) => on.onChange({ optional: optional ? true : undefined })}
        />
        <Check
          label="The applicant may ask the board to waive it"
          checked={item.waivable}
          onChange={(waivable) => on.onChange({ waivable })}
        />
        <Check
          label="This is a state or federal permit"
          checked={item.stateOrFederalPermit === true}
          onChange={(permit) => on.onChange({ stateOrFederalPermit: permit ? true : undefined })}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={index === 0}
            onClick={() => on.onMove(index - 1)}
          >
            Move up
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={index === count - 1}
            onClick={() => on.onMove(index + 1)}
          >
            Move down
          </Button>
        </div>
        <Advanced>
          <Input
            label="Short name"
            hint="Uploaded files are linked under this name. Keep it once applications have used it."
            value={item.key}
            onChange={(e) => on.onChange({ key: e.target.value })}
          />
          <FieldError errors={errors} name={`${path}.key`} />
        </Advanced>
      </div>
    </details>
  )
}

export function DocumentItemsEditor({
  items,
  fields,
  errors,
  onChange,
}: {
  items: DocumentItem[]
  fields: FormField[]
  errors: FieldErrors
  onChange: (next: DocumentItem[]) => void
}) {
  const add = () => {
    const key = uniqueKey('document', new Set(items.map((i) => i.key)))
    onChange([...items, { key, label: '', stage: 'to_file', waivable: false }])
  }
  return (
    <FieldGroup name="documents" label="Documents the applicant provides" errors={errors}>
      <p className="m-0 text-sm text-muted-foreground">
        Each document gets its own upload on the application. Filing items must be in before the
        application can be submitted; later items hold the decision, issuance or certificate.
      </p>
      {items.length === 0 ? <p className="m-0 mt-2 text-sm">No documents are listed.</p> : null}
      {items.map((item, i) => (
        <ItemEditor
          key={rowKey('document', i)}
          item={item}
          index={i}
          count={items.length}
          fields={fields}
          errors={errors}
          onChange={(patch) => onChange(items.map((x, n) => (n === i ? { ...x, ...patch } : x)))}
          onMove={(to) => onChange([...moveItem(items, i, to)])}
          onRemove={() => onChange(items.filter((_, n) => n !== i))}
        />
      ))}
      <RowButton onClick={add}>Add a document</RowButton>
    </FieldGroup>
  )
}
