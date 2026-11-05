'use client'

import { AddressAreaField } from '@/components/address/AddressAreaField'
import { Input, RowButton, rowKey } from '@/components/config/primitives'
import { Legend } from '@/components/ui/legend'
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
    <fieldset className="grid gap-3 rounded-md border p-3">
      <Legend bordered>{label}</Legend>
      <Input label="Name" value={current.name} onChange={(e) => set({ name: e.target.value })} />
      <AddressAreaField
        label="Mailing address"
        rows={3}
        value={current.mailingAddress}
        onValue={(mailingAddress) => set({ mailingAddress })}
      />
    </fieldset>
  )
}

export function RegionalContactsEditor({ body, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg">Neighboring towns</h2>
        <RowButton
          onClick={() =>
            onChange({
              ...body,
              municipalities: [
                {
                  key: `municipality_${body.municipalities.length + 1}`,
                  name: '',
                  mailingAddress: '',
                },
                ...body.municipalities,
              ],
            })
          }
        >
          Add a neighboring town
        </RowButton>
      </div>
      {body.municipalities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No neighboring towns yet. Add each town that should be sent notice.
        </p>
      ) : null}
      {body.municipalities.map((m, i) => (
        <div key={rowKey('municipality', i)} className="grid gap-2 sm:grid-cols-2">
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
          <AddressAreaField
            label="Mailing address"
            rows={2}
            value={m.mailingAddress}
            onValue={(mailingAddress) =>
              onChange({
                ...body,
                municipalities: body.municipalities.map((x, n) =>
                  n === i ? { ...x, mailingAddress } : x,
                ),
              })
            }
            action={
              <RowButton
                onClick={() =>
                  onChange({
                    ...body,
                    municipalities: body.municipalities.filter((_, n) => n !== i),
                  })
                }
              >
                Remove
              </RowButton>
            }
          />
        </div>
      ))}
    </div>
  )
}
