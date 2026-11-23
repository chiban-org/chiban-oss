'use client'

import { AddressAreaField } from '@/components/address/AddressAreaField'
import { Input, RowButton, rowKey } from '@/components/config/primitives'
import { usePackText } from '@/components/PackTextProvider'
import { Legend } from '@/components/ui/legend'
import {
  type Contact,
  type RegionalContactsBody,
  type StoredRegionalContacts,
  withContactDefaults,
} from '@/features/boards/regionalContactsSchema'

type Municipality = RegionalContactsBody['municipalities'][number]

interface Props {
  body: RegionalContactsBody
  onChange: (next: RegionalContactsBody) => void
}

interface EditorProps {
  body: StoredRegionalContacts
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

function hasReceiptContacts(body: RegionalContactsBody): boolean {
  return (
    body.waterSuppliers.length > 0 ||
    body.municipalities.some((m) => m.clerk !== undefined || m.reviewingAuthority !== undefined)
  )
}

function withOffice(
  municipality: Municipality,
  office: 'clerk' | 'reviewingAuthority',
  contact: Contact | null,
): Municipality {
  const { clerk, reviewingAuthority, ...rest } = municipality
  const nextClerk = office === 'clerk' ? contact : (clerk ?? null)
  const nextAuthority = office === 'reviewingAuthority' ? contact : (reviewingAuthority ?? null)
  return {
    ...rest,
    ...(nextClerk === null ? {} : { clerk: nextClerk }),
    ...(nextAuthority === null ? {} : { reviewingAuthority: nextAuthority }),
  }
}

function randomSupplierKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `water_supplier_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function nextSupplierKey(body: RegionalContactsBody): string {
  const used = new Set(body.waterSuppliers.map((w) => w.key))
  let key = randomSupplierKey()
  while (used.has(key)) key = randomSupplierKey()
  return key
}

function WaterSuppliers({ body, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg">Public water suppliers</h2>
        <RowButton
          onClick={() =>
            onChange({
              ...body,
              waterSuppliers: [
                {
                  key: nextSupplierKey(body),
                  name: '',
                  mailingAddress: '',
                },
                ...body.waterSuppliers,
              ],
            })
          }
        >
          Add a public water supplier
        </RowButton>
      </div>
      {body.waterSuppliers.map((w, i) => (
        <div key={rowKey('water_supplier', i)} className="grid gap-2 sm:grid-cols-2">
          <Input
            label="Supplier"
            value={w.name}
            onChange={(e) =>
              onChange({
                ...body,
                waterSuppliers: body.waterSuppliers.map((x, n) =>
                  n === i ? { ...x, name: e.target.value } : x,
                ),
              })
            }
          />
          <AddressAreaField
            label="Mailing address"
            rows={2}
            value={w.mailingAddress}
            onValue={(mailingAddress) =>
              onChange({
                ...body,
                waterSuppliers: body.waterSuppliers.map((x, n) =>
                  n === i ? { ...x, mailingAddress } : x,
                ),
              })
            }
            action={
              <RowButton
                onClick={() =>
                  onChange({
                    ...body,
                    waterSuppliers: body.waterSuppliers.filter((_, n) => n !== i),
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

export function RegionalContactsEditor({ body: stored, onChange }: EditorProps) {
  const { environmentalAgency, receiptNotices } = usePackText()
  const body = withContactDefaults(stored)
  const showReceipt = receiptNotices || hasReceiptContacts(body)
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
        label={environmentalAgency}
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
          {showReceipt ? (
            <div className="grid gap-3 sm:col-span-2">
              <ContactFields
                label="Municipal clerk"
                contact={m.clerk ?? null}
                onChange={(clerk) =>
                  onChange({
                    ...body,
                    municipalities: body.municipalities.map((x, n) =>
                      n === i ? withOffice(x, 'clerk', clerk) : x,
                    ),
                  })
                }
              />
              <ContactFields
                label="Municipal reviewing authority"
                contact={m.reviewingAuthority ?? null}
                onChange={(reviewingAuthority) =>
                  onChange({
                    ...body,
                    municipalities: body.municipalities.map((x, n) =>
                      n === i ? withOffice(x, 'reviewingAuthority', reviewingAuthority) : x,
                    ),
                  })
                }
              />
            </div>
          ) : null}
        </div>
      ))}
      {showReceipt ? <WaterSuppliers body={body} onChange={onChange} /> : null}
    </div>
  )
}
