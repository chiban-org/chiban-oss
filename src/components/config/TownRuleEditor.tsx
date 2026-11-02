'use client'

import { type FieldErrors, FieldGroup, Input } from '@/components/config/primitives'
import type { TownRuleSettingBody } from '@/features/config/kinds'

interface Props {
  body: TownRuleSettingBody
  onChange: (next: TownRuleSettingBody) => void
  errors: FieldErrors
  rule: {
    label: string
    policy: string
    unit: string | null
    citation: { label: string; url: string | null }
  }
}

export function TownRuleEditor({ body, onChange, errors, rule }: Props) {
  return (
    <>
      <p className="text-sm">
        <strong>{rule.label}</strong>
        {` (${rule.citation.label})`}
      </p>
      <p className="text-sm text-muted-foreground">{rule.policy}</p>
      <FieldGroup name="value" label="Value" errors={errors}>
        <Input
          label={rule.unit === null ? 'Town value' : `Town value in ${rule.unit}`}
          type="number"
          value={body.value}
          onChange={(e) => onChange({ ...body, value: Number(e.target.value) })}
        />
      </FieldGroup>
      <FieldGroup name="adoption" label="Adoption record" errors={errors}>
        <Input
          label="Adopting authority"
          value={body.adoptingAuthority ?? ''}
          onChange={(e) => onChange({ ...body, adoptingAuthority: e.target.value })}
        />
        <Input
          label="Adopted on"
          type="date"
          value={body.adoptedOn ?? ''}
          onChange={(e) =>
            onChange({
              ...body,
              adoptedOn:
                e.target.value === '' ? undefined : (e.target.value as typeof body.adoptedOn),
            })
          }
        />
      </FieldGroup>
    </>
  )
}
