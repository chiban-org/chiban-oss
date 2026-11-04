'use client'

import { Area, Input, RowButton, rowKey } from '@/components/config/primitives'
import type { Contact, RegionalContactsBody } from '@/features/boards/regionalContacts'

interface Props {
  body: RegionalContactsBody
  onChange: (next: RegionalContactsBody) => void
}

function ContactFields({
  label,
  contact,
  onChange,
}: {
  label: string
  contact: Contact | null
  onChange: (next: Contact | null) => void
}) {
  const current = contact ?? { name: '', mailingAddress: '' }
  const set = (next: Partial<Contact>) => {
    const merged = { ...current, ...next }
    onChange(merged.name === '' && merged.mailingAddress === '' ? null : merged)
  }
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <Input label="Name" value={current.name} onChange={(e) => set({ name: e.target.value })} />
      <Area
        label="Mailing address"
        rows={3}
        value={current.mailingAddress}
        onChange={(e) => set({ mailingAddress: e.target.value })}
      />
    </fieldset>
  )
}

export function RegionalContactsEditor({ body, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="m-0 text-sm text-muted-foreground">
        When a board finds an application may affect places beyond the town, Chiban writes notice to
        each of these. Leave a contact empty if the town does not send to it.
      </p>
      <ContactFields
        label="Regional planning commission"
        contact={body.commission}
        onChange={(commission) => onChange({ ...body, commission })}
      />
      <ContactFields
        label="NH Department of Environmental Services"
        contact={body.nhDes}
        onChange={(nhDes) => onChange({ ...body, nhDes })}
      />
      <h2 className="text-lg">Neighboring towns</h2>
      {body.municipalities.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          No neighboring towns yet. Add each town that should be sent notice.
        </p>
      ) : null}
      {body.municipalities.map((m, i) => (
        <div
          key={rowKey('municipality', i)}
          className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Input
            label="Town or city"
            value={m.name}
            onChange={(e) =>
              onChange({
                ...body,
                municipalities: body.municipalities.map((x, n) =>
                  n === i
                    ? {
                        ...x,
                        name: e.target.value,
                        key: e.target.value.toLowerCase().replaceAll(' ', '_'),
                      }
                    : x,
                ),
              })
            }
          />
          <Area
            label="Mailing address"
            rows={2}
            value={m.mailingAddress}
            onChange={(e) =>
              onChange({
                ...body,
                municipalities: body.municipalities.map((x, n) =>
                  n === i ? { ...x, mailingAddress: e.target.value } : x,
                ),
              })
            }
          />
          <RowButton
            onClick={() =>
              onChange({ ...body, municipalities: body.municipalities.filter((_, n) => n !== i) })
            }
          >
            Remove
          </RowButton>
        </div>
      ))}
      <RowButton
        onClick={() =>
          onChange({
            ...body,
            municipalities: [
              ...body.municipalities,
              {
                key: `municipality_${body.municipalities.length + 1}`,
                name: '',
                mailingAddress: '',
              },
            ],
          })
        }
      >
        Add a neighboring town
      </RowButton>
    </div>
  )
}
