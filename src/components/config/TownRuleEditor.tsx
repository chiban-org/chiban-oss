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
    settable?: boolean
    unit: string | null
    citation: { label: string; url: string | null }
  }
}

export function TownRuleEditor({ body, onChange, errors, rule }: Props) {
  const settable = rule.settable !== false
  return (
    <>
      <p className="m-0 text-sm">
        <strong>{rule.label}</strong>
        {` (${rule.citation.label})`}
      </p>
      <p className="m-0 mt-1 text-sm text-muted-foreground">{rule.policy}</p>
      {settable ? null : (
        <p role="note" className="mt-3 text-sm">
          State law does not let the town change this rule, so Chiban always uses the state value.
          This draft cannot be published.
        </p>
      )}
      <FieldGroup name="value" label="The town's value" errors={errors}>
        <Input
          label={rule.unit === null ? 'Value' : `Value, in ${rule.unit}`}
          type="number"
          disabled={!settable}
          value={body.value}
          onChange={(e) => onChange({ ...body, value: Number(e.target.value) })}
        />
      </FieldGroup>
      <FieldGroup name="adoption" label="Adoption record" errors={errors}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Adopted by"
            hint="The body that voted the value in, for example Town Meeting."
            disabled={!settable}
            value={body.adoptingAuthority ?? ''}
            onChange={(e) => onChange({ ...body, adoptingAuthority: e.target.value })}
          />
          <Input
            label="Adopted on"
            type="date"
            disabled={!settable}
            value={body.adoptedOn ?? ''}
            onChange={(e) =>
              onChange({
                ...body,
                adoptedOn:
                  e.target.value === '' ? undefined : (e.target.value as typeof body.adoptedOn),
              })
            }
          />
        </div>
      </FieldGroup>
    </>
  )
}
