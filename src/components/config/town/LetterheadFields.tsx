'use client'

import { AddressCheck } from '@/components/address/AddressCheck'
import { TextRows } from '@/components/config/plainFields'
import { Check, Input, Pick } from '@/components/config/primitives'
import { Legend } from '@/components/ui/legend'
import type { EditorBoard } from '@/features/config/editorContext'
import type {
  BoardOverride,
  ContactLine,
  Letterhead,
  TownProfileBody,
} from '@/features/town/profileSchema'

interface Props {
  body: TownProfileBody
  boards: readonly EditorBoard[]
  onChange: (next: TownProfileBody) => void
}

const CONTACT_LABELS: readonly (readonly [ContactLine, string])[] = [
  ['address', 'Mailing address'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['website', 'Website'],
  ['officeHours', 'Office hours'],
]

function overrideOf(body: TownProfileBody, boardId: string): BoardOverride {
  return new Map(Object.entries(body.boardOverrides)).get(boardId) ?? {}
}

function shown(lines: Letterhead['contactLines'], line: ContactLine): boolean {
  return new Map(Object.entries(lines)).get(line) === true
}

function BoardOverrideFields({
  label,
  value,
  onChange,
}: {
  label: string
  value: BoardOverride
  onChange: (next: BoardOverride) => void
}) {
  return (
    <fieldset className="grid gap-3 border-t border-hairline pt-4">
      <Legend>{label}</Legend>
      <Input
        label="Office name on this board's documents"
        hint="Leave empty to use the town office name."
        value={value.officeName ?? ''}
        onChange={(e) => onChange({ ...value, officeName: e.target.value })}
      />
      <AddressCheck
        lines={value.addressLines ?? []}
        maxLines={3}
        onUse={(addressLines) => onChange({ ...value, addressLines })}
        className="grid gap-1.5"
      >
        <TextRows
          legend="Address on this board's documents"
          hint="Up to three lines. Leave empty to use the town address."
          rowLabel="Address line"
          addLabel="Add an address line"
          max={3}
          values={value.addressLines ?? []}
          onChange={(next) => onChange({ ...value, addressLines: next.slice(0, 3) })}
        />
      </AddressCheck>
      <Input
        label="Footer on this board's documents"
        value={value.footerText ?? ''}
        onChange={(e) => onChange({ ...value, footerText: e.target.value })}
      />
    </fieldset>
  )
}

export function LetterheadFields({ body, boards, onChange }: Props) {
  const letterhead = body.letterhead
  const set = (next: Partial<Letterhead>) =>
    onChange({ ...body, letterhead: { ...letterhead, ...next } })
  return (
    <div className="grid gap-5">
      <Pick
        label="Logo position"
        value={letterhead.logoPosition}
        options={[
          ['left', 'Left, beside the town name'],
          ['center', 'Centered above the town name'],
        ]}
        onChange={(e) => set({ logoPosition: e.target.value === 'center' ? 'center' : 'left' })}
      />
      <fieldset className="grid gap-2">
        <Legend>Contact lines under the office name</Legend>
        <p className="m-0 text-sm text-muted-foreground">
          The address, phone, email, website and office hours come from the{' '}
          <a href="/staff/settings/town-profile">Town profile</a>. Change them there.
        </p>
        {CONTACT_LABELS.map(([line, label]) => (
          <Check
            key={line}
            label={label}
            checked={shown(letterhead.contactLines, line)}
            onChange={(checked) =>
              set({ contactLines: { ...letterhead.contactLines, [line]: checked } })
            }
          />
        ))}
      </fieldset>
      <Input
        label="Footer text"
        hint="Printed at the bottom of every page, for example a privacy line. Leave the contact details to the lines above."
        value={letterhead.footerText}
        onChange={(e) => set({ footerText: e.target.value })}
      />
      <Check
        label="Number the pages (Page 1 of 2)"
        checked={letterhead.pageNumbers}
        onChange={(pageNumbers) => set({ pageNumbers })}
      />
      <div className="grid gap-4">
        <h2 className="m-0 text-base">Board documents</h2>
        <p className="m-0 text-sm text-muted-foreground">
          Notices, decisions and agendas for a board can carry its own office name, address and
          footer.
        </p>
        {boards.map((board) => (
          <BoardOverrideFields
            key={board.id}
            label={board.shortName}
            value={overrideOf(body, board.id)}
            onChange={(next) =>
              onChange({ ...body, boardOverrides: { ...body.boardOverrides, [board.id]: next } })
            }
          />
        ))}
      </div>
    </div>
  )
}
