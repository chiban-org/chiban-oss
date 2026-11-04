'use client'

import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import { FormEntry } from '@/components/forms/FormRenderer'
import { describeCondition } from '@/features/forms/conditionRules'
import type { FormField } from '@/features/forms/formSchema'
import { TYPE_WORDS } from '@/features/forms/questionTypes'
import { cn } from '@/lib/utils'

const NO_VALUES = {}

function translate(transform: { x: number; y: number } | null): string | undefined {
  return transform === null ? undefined : `translate3d(${transform.x}px, ${transform.y}px, 0)`
}
const ignore = () => undefined

function Notes({
  field,
  fields,
  issue,
}: {
  field: FormField
  fields: FormField[]
  issue?: string
}) {
  const notes = [
    field.type === 'section' ? null : TYPE_WORDS[field.type],
    field.staffOnly === true ? 'Staff only' : null,
    field.showIf === undefined
      ? null
      : `Shown only when ${describeCondition(field.showIf, fields)}`,
    field.requireIf === undefined
      ? null
      : `Required only when ${describeCondition(field.requireIf, fields)}`,
  ].filter((n): n is string => n !== null)
  return (
    <>
      {notes.length === 0 ? null : (
        <p className="m-0 mt-2 text-sm text-muted-foreground">{notes.join(' · ')}</p>
      )}
      {issue === undefined ? null : (
        <p className="m-0 mt-1 text-sm font-medium text-status-failed-fg">{issue}</p>
      )}
    </>
  )
}

export function QuestionCard({
  id,
  field,
  fields,
  selected,
  issue,
  onSelect,
}: {
  id: string
  field: FormField
  fields: FormField[]
  selected: boolean
  issue: string | undefined
  onSelect: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const label = field.label === '' ? 'Untitled' : field.label
  return (
    <li
      ref={setNodeRef}
      style={{ transform: translate(transform), transition }}
      className={cn(
        'relative list-none rounded-md border bg-surface p-3',
        selected
          ? 'border-action ring-2 ring-action/25'
          : 'border-transparent hover:border-hairline',
        issue !== undefined && !selected ? 'border-status-failed-fg' : null,
        isDragging ? 'z-20 shadow-md' : null,
      )}
    >
      <button
        type="button"
        aria-label={`Edit ${label}`}
        aria-pressed={selected}
        className="absolute inset-0 z-0 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        onClick={onSelect}
      />
      <div className="pointer-events-none relative z-10 flex gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${label}`}
          className="pointer-events-auto -ml-1 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-canvas focus-visible:outline-2 focus-visible:outline-action active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div inert>
            <FormEntry field={field} values={NO_VALUES} error={undefined} onChange={ignore} />
          </div>
          <Notes field={field} fields={fields} {...(issue === undefined ? {} : { issue })} />
        </div>
      </div>
    </li>
  )
}
