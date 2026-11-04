'use client'

import { FieldError, type FieldErrors, Input, RowButton } from '@/components/config/primitives'
import { ImageUpload } from '@/components/config/town/ImageUpload'
import type { TownProfileBody } from '@/features/town/profileSchema'

interface Props {
  body: TownProfileBody
  onChange: (next: TownProfileBody) => void
  errors: FieldErrors
}

const MAX_ADDRESS_LINES = 3

export function ProfileFields({ body, onChange, errors }: Props) {
  const set = (next: Partial<TownProfileBody>) => onChange({ ...body, ...next })
  const setLine = (index: number, value: string) =>
    set({ addressLines: body.addressLines.map((line, i) => (i === index ? value : line)) })
  return (
    <div className="grid gap-5">
      <div>
        <Input
          label="Office name"
          hint="Printed under the town name, for example Land Use Office."
          value={body.officeName}
          onChange={(e) => set({ officeName: e.target.value })}
          required
        />
        <FieldError errors={errors} name="officeName" />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Mailing address</legend>
        {body.addressLines.map((line, index) => (
          <div key={`address-${String(index)}`} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label={`Address line ${String(index + 1)}`}
                value={line}
                onChange={(e) => setLine(index, e.target.value)}
              />
            </div>
            {body.addressLines.length > 1 ? (
              <RowButton
                onClick={() =>
                  set({ addressLines: body.addressLines.filter((_, i) => i !== index) })
                }
              >
                Remove
              </RowButton>
            ) : null}
          </div>
        ))}
        {body.addressLines.length < MAX_ADDRESS_LINES ? (
          <div>
            <RowButton onClick={() => set({ addressLines: [...body.addressLines, ''] })}>
              Add an address line
            </RowButton>
          </div>
        ) : null}
        <FieldError errors={errors} name="addressLines" />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Phone"
          type="tel"
          value={body.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <div>
          <Input
            label="Email"
            type="email"
            value={body.email}
            onChange={(e) => set({ email: e.target.value })}
          />
          <FieldError errors={errors} name="email" />
        </div>
        <div>
          <Input
            label="Website"
            type="url"
            placeholder="https://"
            value={body.website}
            onChange={(e) => set({ website: e.target.value })}
          />
          <FieldError errors={errors} name="website" />
        </div>
        <Input
          label="Office hours"
          value={body.officeHours}
          onChange={(e) => set({ officeHours: e.target.value })}
        />
      </div>
      <ImageUpload
        label="Town logo or seal"
        hint="PNG or JPEG, up to 2 MB. Printed at the top of every document."
        image={body.logo}
        onChange={(logo) => set({ logo })}
      />
    </div>
  )
}
