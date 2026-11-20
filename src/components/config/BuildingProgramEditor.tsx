'use client'

import { useEditorContext } from '@/components/config/EditorContextProvider'
import { Check, FieldError, type FieldErrors, Input, Pick } from '@/components/config/primitives'
import type { BuildingProgramBody } from '@/features/buildingProgram/schema'

interface Props {
  body: BuildingProgramBody
  onChange: (next: BuildingProgramBody) => void
  errors: FieldErrors
}

const NO_CODE = ''

function toResidents(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function BuildingProgramEditor({ body, onChange, errors }: Props) {
  const codes = useEditorContext().buildingCodes
  const choices = codes?.choices ?? []
  const single = choices.length === 1 ? choices[0] : undefined
  return (
    <div className="space-y-3">
      <Check
        label="The town issues building permits"
        checked={body.permitsEnabled}
        onChange={(checked) => onChange({ ...body, permitsEnabled: checked })}
      />
      <FieldError errors={errors} name="permitsEnabled" />
      {single === undefined ? (
        <div>
          <Pick
            label="Building code the town enforces"
            value={body.codeChoice ?? NO_CODE}
            options={[
              [NO_CODE, 'No building code'],
              ...choices.map((c) => [c.key, c.label] as const),
            ]}
            onChange={(e) =>
              onChange({ ...body, codeChoice: e.target.value === NO_CODE ? null : e.target.value })
            }
          />
          <FieldError errors={errors} name="codeChoice" />
        </div>
      ) : (
        <p>
          <span className="font-medium">Building code the town enforces: </span>
          {single.label}
        </p>
      )}
      {codes?.requiredAbove != null && (
        <div>
          <Input
            label="Residents"
            type="number"
            min={0}
            value={body.residents === null ? '' : String(body.residents)}
            onChange={(e) => onChange({ ...body, residents: toResidents(e.target.value) })}
          />
          <FieldError errors={errors} name="residents" />
        </div>
      )}
    </div>
  )
}
