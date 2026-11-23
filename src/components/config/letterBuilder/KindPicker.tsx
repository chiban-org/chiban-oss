'use client'

import { Pick } from '@/components/config/primitives'
import { usePackText } from '@/components/PackTextProvider'
import type { Vocabulary } from '@/features/packs/vocabulary'
import { kindLabel } from '@/features/templates/kinds/kindWords'
import { TEMPLATE_KINDS, type TemplateKind } from '@/features/templates/templateSchema'

function kindOptions(words: Vocabulary): [TemplateKind, string][] {
  return TEMPLATE_KINDS.map((kind) => [kind, kindLabel(kind, words)])
}

export function KindPicker({
  value,
  locked,
  onChange,
}: {
  value: TemplateKind
  locked: boolean
  onChange: (kind: TemplateKind) => void
}) {
  const { vocabulary } = usePackText()
  return (
    <Pick
      label="Kind of document"
      value={value}
      options={kindOptions(vocabulary)}
      disabled={locked}
      hint={locked ? 'The kind cannot change once a version has been put into use.' : undefined}
      onChange={(e) => {
        const next = TEMPLATE_KINDS.find((k) => k === e.target.value)
        if (next !== undefined) onChange(next)
      }}
    />
  )
}
