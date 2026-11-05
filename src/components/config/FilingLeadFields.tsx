'use client'

import { FieldError, type FieldErrors, FieldGroup, Input } from '@/components/config/primitives'
import type { BoardSettingsBody } from '@/features/boards/boardSettings'
import type { CivilDate } from '@/types/civilDate'

type Board = BoardSettingsBody['boards'][number]

interface Props {
  board: Board
  onChange: (next: Partial<Board>) => void
  errors: FieldErrors
}

function toDaysOrNull(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function FilingLeadFields({ board, onChange, errors }: Props) {
  const adoption = board.filingLeadAdoption ?? { adoptingAuthority: '', adoptedOn: null }
  return (
    <div className="sm:col-span-2">
      <Input
        label="Filing deadline, days before the meeting"
        hint="How many days before a meeting an application must be filed. Leave empty to use the 21 days state law sets."
        type="number"
        min={1}
        value={board.filingLeadDays ?? ''}
        onChange={(e) => onChange({ filingLeadDays: toDaysOrNull(e.target.value) })}
      />
      <FieldError errors={errors} name="filingLeadDays" />
      {board.filingLeadDays === null ? null : (
        <FieldGroup
          name="filingLeadAdoption"
          label="Adoption record for the filing deadline"
          errors={errors}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Adopted by"
              hint="The body that voted the deadline in, for example the Planning Board."
              value={adoption.adoptingAuthority}
              onChange={(e) =>
                onChange({
                  filingLeadAdoption: { ...adoption, adoptingAuthority: e.target.value },
                })
              }
            />
            <Input
              label="Adopted on"
              type="date"
              value={adoption.adoptedOn ?? ''}
              onChange={(e) =>
                onChange({
                  filingLeadAdoption: {
                    ...adoption,
                    adoptedOn: e.target.value === '' ? null : (e.target.value as CivilDate),
                  },
                })
              }
            />
          </div>
        </FieldGroup>
      )}
    </div>
  )
}
