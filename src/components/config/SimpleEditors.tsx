'use client'

import { Area, FieldError, type FieldErrors, Input } from '@/components/config/primitives'
import { WordDiffPreview } from '@/components/config/TextDiff'
import type { LocalCodeAmendmentBody } from '@/features/config/kinds'

export function LocalAmendmentEditor({
  body,
  onChange,
  errors,
}: {
  body: LocalCodeAmendmentBody
  onChange: (next: LocalCodeAmendmentBody) => void
  errors: FieldErrors
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Input
          label="Title"
          hint="A short name for the change, for example Snow load for roofs."
          value={body.title}
          onChange={(e) => onChange({ ...body, title: e.target.value })}
        />
        <FieldError errors={errors} name="title" />
      </div>
      <div>
        <Input
          label="Code section"
          hint="The section of the state building code it changes, for example IRC R301.2."
          value={body.codeSection}
          onChange={(e) => onChange({ ...body, codeSection: e.target.value })}
        />
        <FieldError errors={errors} name="codeSection" />
      </div>
      <div>
        <Input
          label="Adopted by"
          hint="The body that voted it in, for example Town Meeting."
          value={body.adoptingAuthority}
          onChange={(e) => onChange({ ...body, adoptingAuthority: e.target.value })}
        />
        <FieldError errors={errors} name="adoptingAuthority" />
      </div>
      <div>
        <Input
          label="Adopted on"
          type="date"
          value={body.adoptedOn}
          onChange={(e) =>
            onChange({ ...body, adoptedOn: e.target.value as typeof body.adoptedOn })
          }
        />
        <FieldError errors={errors} name="adoptedOn" />
      </div>
      <Input
        label="Confirmed by the building code review board on"
        hint="Leave empty until the state board confirms it."
        type="date"
        value={body.reviewBoardConfirmedOn ?? ''}
        onChange={(e) =>
          onChange({
            ...body,
            reviewBoardConfirmedOn:
              e.target.value === '' ? null : (e.target.value as typeof body.adoptedOn),
          })
        }
      />
      <div className="grid gap-3 sm:col-span-2 md:grid-cols-2">
        <Area
          label="State code text"
          hint="Paste the section as the state code writes it."
          rows={8}
          value={body.stateText ?? ''}
          onChange={(e) => onChange({ ...body, stateText: e.target.value })}
        />
        <Area
          label="Town's amended text"
          hint="What the town adopted in its place."
          rows={8}
          value={body.townText ?? ''}
          onChange={(e) => onChange({ ...body, townText: e.target.value })}
        />
      </div>
      {(body.stateText ?? '').trim() === '' || (body.townText ?? '').trim() === '' ? null : (
        <div className="sm:col-span-2">
          <WordDiffPreview before={body.stateText ?? ''} after={body.townText ?? ''} />
        </div>
      )}
    </div>
  )
}
