'use client'

import { Pick } from '@/components/config/primitives'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { TEMPLATE_KINDS, type TemplateKind } from '@/features/templates/templateSchema'

export const KIND_OPTIONS = TEMPLATE_KINDS.map((kind): [TemplateKind, string] => [
  kind,
  documentKind(kind).label,
])

export function KindPicker({
  value,
  locked,
  onChange,
}: {
  value: TemplateKind
  locked: boolean
  onChange: (kind: TemplateKind) => void
}) {
  return (
    <Pick
      label="Kind of document"
      value={value}
      options={KIND_OPTIONS}
      disabled={locked}
      hint={locked ? 'The kind cannot change after the first publish.' : undefined}
      onChange={(e) => {
        const next = TEMPLATE_KINDS.find((k) => k === e.target.value)
        if (next !== undefined) onChange(next)
      }}
    />
  )
}
