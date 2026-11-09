'use client'

import { FIELD_LABELS, type WordingField } from '@/features/notifications/wording/wordingFields'
import type { WordingKey } from '@/features/notifications/wording/wordingKeys'
import { allowedFields } from '@/features/notifications/wording/wordingSchema'

export function WordingFieldList({
  fieldKey,
  onInsert,
}: {
  fieldKey: WordingKey
  onInsert: (field: string) => void
}) {
  const labels = new Map(Object.entries(FIELD_LABELS))
  const fields = [...allowedFields(fieldKey)] as WordingField[]
  return (
    <div>
      <p className="m-0 mb-1 font-semibold text-ink">Fields this message can use</p>
      <p className="m-0 mb-2 text-sm text-muted-foreground">
        Select a field to add it to the message where the cursor is.
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {fields.map((field) => (
          <li key={field}>
            <button
              type="button"
              onClick={() => onInsert(field)}
              className="tap-target rounded-sm border border-control-border bg-surface px-2 py-1 text-left text-sm text-ink hover:bg-canvas"
            >
              <span className="font-mono">{`{{${field}}}`}</span>
              <span className="ml-2 text-muted-foreground">{labels.get(field)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
