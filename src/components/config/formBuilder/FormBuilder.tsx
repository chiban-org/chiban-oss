'use client'

import { Eye, PencilRuler } from 'lucide-react'
import { type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { ApplicantPreview } from '@/components/config/formBuilder/ApplicantPreview'
import { PressedGroup } from '@/components/config/formBuilder/PressedGroup'
import { QuestionCanvas } from '@/components/config/formBuilder/QuestionCanvas'
import { QuestionPalette } from '@/components/config/formBuilder/QuestionPalette'
import { QuestionSettings } from '@/components/config/formBuilder/QuestionSettings'
import { RemoveQuestionDialog } from '@/components/config/formBuilder/RemoveQuestionDialog'
import { FieldError, type FieldErrors, Input } from '@/components/config/primitives'
import {
  addEntry,
  indexAfterMove,
  moveEntry,
  orderIssues,
  removeEntry,
} from '@/features/forms/formEdits'
import { type FormBuilderData, referencesTo } from '@/features/forms/formReferences'
import type { FieldType, FormBody } from '@/features/forms/formSchema'

type Mode = 'design' | 'preview'

function keepEnterFromSubmitting(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
}

function revealBelowFold(element: HTMLElement | null) {
  if (element === null || element.getBoundingClientRect().top < window.innerHeight) return
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const MODES = [
  ['design', 'Design', PencilRuler],
  ['preview', 'Preview as applicant', Eye],
] as const

export function FormBuilder({
  body,
  onChange,
  errors,
  data,
}: {
  body: FormBody
  onChange: (next: FormBody) => void
  errors: FieldErrors
  data: FormBuilderData
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('design')
  const [removing, setRemoving] = useState<number | null>(null)
  const settingsRef = useRef<HTMLElement>(null)
  const frozen = useMemo(() => new Set(data.frozenKeys), [data.frozenKeys])
  const selected = picked !== null && picked < body.fields.length ? picked : null
  const references = (i: number | null) =>
    i === null ? [] : referencesTo(body, i, data.externalUses)
  const add = (type: FieldType) => {
    const added = addEntry(body, type, selected)
    onChange(added.body)
    setPicked(added.index)
    setMode('design')
  }
  const move = (from: number, to: number) => {
    onChange(moveEntry(body, from, to))
    setPicked(indexAfterMove(selected, from, to))
  }
  const remove = (i: number) => {
    onChange(removeEntry(body, i))
    setRemoving(null)
    setPicked(body.fields.length > 1 ? Math.max(0, i - 1) : null)
  }
  return (
    <div className="@container" onKeyDown={keepEnterFromSubmitting}>
      <Input
        label="Form title"
        value={body.label}
        onChange={(e) => onChange({ ...body, label: e.target.value })}
      />
      <FieldError errors={errors} name="label" />
      <div className="mt-6 grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_19rem] @5xl:grid-cols-[11rem_minmax(0,1fr)_20rem]">
        <div className="@3xl:col-span-2 @5xl:col-span-1">
          <QuestionPalette onAdd={add} />
        </div>
        <div className="min-w-0 rounded-md bg-canvas p-3 @md:p-4">
          <PressedGroup
            label="View"
            className="mb-3"
            options={MODES}
            value={mode}
            onChange={setMode}
          />
          <FieldError errors={errors} name="fields" />
          {mode === 'design' ? (
            <QuestionCanvas
              fields={body.fields}
              selected={selected}
              issues={orderIssues(body)}
              onSelect={(i) => {
                setPicked(i)
                revealBelowFold(settingsRef.current)
              }}
              onMove={move}
            />
          ) : (
            <ApplicantPreview form={body} />
          )}
        </div>
        <section
          ref={settingsRef}
          aria-labelledby="question-settings-title"
          data-plain
          className="min-w-0 self-start @3xl:sticky @3xl:top-4"
        >
          <h2
            id="question-settings-title"
            className="mt-0 mb-2 font-sans text-sm font-bold text-muted-foreground"
          >
            Question settings
          </h2>
          {selected === null ? (
            <p className="text-muted-foreground">Select a question to change it.</p>
          ) : (
            <QuestionSettings
              key={selected}
              body={body}
              index={selected}
              frozen={frozen}
              references={references(selected)}
              onChange={onChange}
              onMove={(by) => move(selected, selected + by)}
              onRemove={() =>
                references(selected).length === 0 ? remove(selected) : setRemoving(selected)
              }
            />
          )}
        </section>
      </div>
      <RemoveQuestionDialog
        label={removing === null ? null : (body.fields[removing]?.label ?? null)}
        references={references(removing)}
        onConfirm={() => (removing === null ? undefined : remove(removing))}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
