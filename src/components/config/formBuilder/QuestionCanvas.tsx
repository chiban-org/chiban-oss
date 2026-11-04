'use client'

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useId } from 'react'
import { QuestionCard } from '@/components/config/formBuilder/QuestionCard'
import type { FormField } from '@/features/forms/formSchema'

const DRAG_START_DISTANCE = 4

function entryIds(fields: readonly FormField[]): string[] {
  const seen = new Set<string>()
  return fields.map((f, i) => {
    const id = seen.has(f.key) ? `${f.key}#${i}` : f.key
    seen.add(f.key)
    return id
  })
}

function announcements(ids: string[], fields: FormField[]): Announcements {
  const name = (id: UniqueIdentifier) => fields[ids.indexOf(String(id))]?.label ?? 'Question'
  const place = (id: UniqueIdentifier | undefined) =>
    `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => `${name(active.id)} is over ${place(over?.id)}.`,
    onDragEnd: ({ active, over }) => `${name(active.id)} dropped at ${place(over?.id)}.`,
    onDragCancel: ({ active }) => `Stopped moving ${name(active.id)}.`,
  }
}

const INSTRUCTIONS =
  'To reorder a question, press space or enter on its handle, use the arrow keys to move it, and press space or enter again to drop it. Press escape to cancel.'

export function QuestionCanvas({
  fields,
  selected,
  issues,
  onSelect,
  onMove,
}: {
  fields: FormField[]
  selected: number | null
  issues: Record<number, string>
  onSelect: (index: number) => void
  onMove: (from: number, to: number) => void
}) {
  const dndId = useId()
  const ids = entryIds(fields)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_START_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const dropped = ({ active, over }: DragEndEvent) => {
    if (over === null || active.id === over.id) return
    onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }
  if (fields.length === 0) {
    return <p className="text-muted-foreground">Add a question from the list to start the form.</p>
  }
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dropped}
      accessibility={{
        announcements: announcements(ids, fields),
        screenReaderInstructions: { draggable: INSTRUCTIONS },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label="Questions" className="m-0 flex flex-col gap-1 p-0">
          {fields.map((field, i) => (
            <QuestionCard
              key={ids[i]}
              id={ids[i] ?? String(i)}
              field={field}
              fields={fields}
              selected={selected === i}
              issue={issues[i]}
              onSelect={() => onSelect(i)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
