'use client'

import { AdvancedSettings } from '@/components/config/formBuilder/AdvancedSettings'
import { ChoicesEditor } from '@/components/config/formBuilder/ChoicesEditor'
import { ConditionBuilder } from '@/components/config/formBuilder/ConditionBuilder'
import { Area, Check, Input, Pick } from '@/components/config/primitives'
import { Button } from '@/components/ui/button'
import { changeType, patchField, relabel, setKey } from '@/features/forms/formEdits'
import type { FieldReference } from '@/features/forms/formReferences'
import type { FieldType, FormBody, FormField } from '@/features/forms/formSchema'
import { ANSWER_TYPE_CHOICES, hasChoices, isNumberQuestion } from '@/features/forms/questionTypes'

interface Props {
  body: FormBody
  index: number
  frozen: ReadonlySet<string>
  references: FieldReference[]
  onChange: (next: FormBody) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}

function limit(text: string): number | undefined {
  return text === '' ? undefined : Number(text)
}

function NumberLimits({
  field,
  onPatch,
}: {
  field: FormField
  onPatch: (p: Partial<FormField>) => void
}) {
  const set = (name: 'min' | 'max', text: string) =>
    onPatch({ validation: { ...field.validation, [name]: limit(text) } })
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        label="Smallest allowed"
        type="number"
        value={field.validation?.min ?? ''}
        onChange={(e) => set('min', e.target.value)}
      />
      <Input
        label="Largest allowed"
        type="number"
        value={field.validation?.max ?? ''}
        onChange={(e) => set('max', e.target.value)}
      />
    </div>
  )
}

function QuestionOnly({
  body,
  field,
  index,
  frozen,
  onChange,
}: Omit<Props, 'onMove' | 'onRemove' | 'references'> & { field: FormField }) {
  const patch = (p: Partial<FormField>) => onChange(patchField(body, index, p))
  return (
    <>
      <Pick
        label="Answer type"
        value={field.type}
        options={ANSWER_TYPE_CHOICES}
        onChange={(e) => onChange(changeType(body, index, e.target.value as FieldType))}
      />
      <Check label="Required" checked={field.required} onChange={(on) => patch({ required: on })} />
      {hasChoices(field) ? (
        <ChoicesEditor body={body} index={index} frozen={frozen} onChange={onChange} />
      ) : null}
      {isNumberQuestion(field) ? <NumberLimits field={field} onPatch={patch} /> : null}
      <ConditionBuilder
        title="Show only when"
        fields={body.fields}
        index={index}
        value={field.showIf}
        onChange={(showIf) => patch({ showIf })}
      />
      <ConditionBuilder
        title="Required only when"
        fields={body.fields}
        index={index}
        value={field.requireIf}
        onChange={(requireIf) => patch({ requireIf })}
      />
    </>
  )
}

export function QuestionSettings(props: Props) {
  const { body, index, frozen, references, onChange, onMove, onRemove } = props
  const field = body.fields[index]
  if (field === undefined) return null
  const section = field.type === 'section'
  const patch = (p: Partial<FormField>) => onChange(patchField(body, index, p))
  return (
    <div className="grid gap-4">
      <Input
        label={section ? 'Section title' : 'Question text'}
        value={field.label}
        onChange={(e) => onChange(relabel(body, index, e.target.value, frozen))}
      />
      <Area
        label={section ? 'Description' : 'Help text'}
        rows={2}
        value={field.help ?? ''}
        onChange={(e) => patch({ help: e.target.value === '' ? undefined : e.target.value })}
      />
      {section ? null : (
        <QuestionOnly body={body} field={field} index={index} frozen={frozen} onChange={onChange} />
      )}
      <AdvancedSettings
        field={field}
        frozen={frozen.has(field.key)}
        references={references}
        onKey={(key) => onChange(setKey(body, index, key))}
        onPatch={patch}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          Move up
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index === body.fields.length - 1}
          onClick={() => onMove(1)}
        >
          Move down
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
          {section ? 'Remove section' : 'Remove question'}
        </Button>
      </div>
    </div>
  )
}
