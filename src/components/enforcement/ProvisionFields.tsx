'use client'

import { useEffect, useRef, useState } from 'react'
import { SelectField } from '@/components/staff/fields'
import { PROVISION_KINDS, type ProvisionKind } from '@/db/schema/enforcementOrders'
import { PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import type { SuggestionsByKind } from '@/features/enforcement/sections/suggestions'
import { SectionCombobox } from './SectionCombobox'

const KINDS = Object.entries(PROVISION_KIND_LABELS)

function kindChoices(buildingCode: boolean, current: ProvisionKind) {
  return buildingCode || current === 'building_code'
    ? KINDS
    : KINDS.filter(([kind]) => kind !== 'building_code')
}

function isKind(value: string): value is ProvisionKind {
  return (PROVISION_KINDS as readonly string[]).includes(value)
}

function suggestionsOf(all: SuggestionsByKind | null, kind: ProvisionKind) {
  return Object.entries(all ?? {}).find(([k]) => k === kind)?.[1] ?? []
}

export function ProvisionFields({
  suggestions,
  buildingCode,
  defaultKind = 'zoning_ordinance',
  defaultRef,
}: {
  suggestions: SuggestionsByKind | null
  buildingCode: boolean
  defaultKind?: ProvisionKind
  defaultRef?: string
}) {
  const [kind, setKind] = useState<ProvisionKind>(defaultKind)
  const selectRef = useRef<HTMLSelectElement | null>(null)
  useEffect(() => {
    const form = selectRef.current?.form ?? null
    if (form === null) return
    const reset = () => setKind(defaultKind)
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [defaultKind])
  return (
    <>
      <SelectField
        label="What was violated"
        name="provisionKind"
        ref={selectRef}
        options={kindChoices(buildingCode, defaultKind)}
        defaultValue={defaultKind}
        onChange={(event) => {
          if (isKind(event.target.value)) setKind(event.target.value)
        }}
      />
      <SectionCombobox
        suggestions={suggestionsOf(suggestions, kind)}
        {...(defaultRef === undefined ? {} : { defaultValue: defaultRef })}
      />
    </>
  )
}
