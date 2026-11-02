'use client'

import type { ReactNode } from 'react'
import type { CounterOutcome } from '@/components/counter/counterTypes'
import { formatCents } from '@/lib/money'

export type Method = 'cash' | 'check' | 'card'

export interface WorkField {
  key: string
  label: string
  type: string
  required: boolean
  options?: { value: string; label: string }[]
}

export const CONTROL = 'mt-1 block w-full rounded-md border bg-surface px-3 py-2 text-sm'

const RESULTS = [
  ['active', 'Active'],
  ['not_found', 'Not found'],
  ['expired', 'Expired'],
  ['inactive', 'Inactive'],
] as const

const METHODS = [
  ['cash', 'Cash'],
  ['check', 'Check'],
  ['card', 'Card'],
] as const

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  )
}

function WorkInput({ field }: { field: WorkField }) {
  const name = `value.${field.key}`
  if (field.type === 'textarea') {
    return <textarea name={name} required={field.required} className={CONTROL} rows={3} />
  }
  if (field.type === 'checkbox') return <input type="checkbox" name={name} className="ml-2" />
  if (field.type === 'select') {
    return (
      <select name={name} required={field.required} className={CONTROL}>
        <option value="" />
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'
  return <input type={inputType} name={name} required={field.required} className={CONTROL} />
}

export function ContractorSection({
  defaultLicenseType,
  lookup,
}: {
  defaultLicenseType: string
  lookup: { label: string; url: string }
}) {
  return (
    <section aria-labelledby="contractor" className="space-y-3">
      <h2 id="contractor">Contractor and license check</h2>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Contractor name">
          <input name="contractorName" required className={CONTROL} />
        </Labeled>
        <Labeled label="Contractor email">
          <input type="email" name="contractorEmail" className={CONTROL} />
        </Labeled>
        <Labeled label="License number">
          <input name="licenseNumber" required className={CONTROL} />
        </Labeled>
        <Labeled label="License type">
          <input
            name="licenseType"
            required
            defaultValue={defaultLicenseType}
            className={CONTROL}
          />
        </Labeled>
        <Labeled label="Result of the state lookup">
          <select name="licenseResult" className={CONTROL} defaultValue="active">
            {RESULTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Note">
          <input name="licenseNote" className={CONTROL} />
        </Labeled>
      </div>
      <a
        href={lookup.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-action underline"
      >
        {lookup.label}
      </a>
    </section>
  )
}

export function WorkSection({ fields }: { fields: WorkField[] }) {
  return (
    <section aria-labelledby="work" className="space-y-3">
      <h2 id="work">Work details</h2>
      {fields.map((field) => (
        <Labeled key={field.key} label={field.label}>
          <WorkInput field={field} />
        </Labeled>
      ))}
    </section>
  )
}

export function FeeSection({
  baseCents,
  convenienceCents,
  card,
}: {
  baseCents: number
  convenienceCents: number
  card: boolean
}) {
  return (
    <section aria-labelledby="fee" className="space-y-1">
      <h2 id="fee">Fee</h2>
      <p>Permit fee {formatCents(baseCents)}</p>
      {card ? <p>Convenience fee {formatCents(convenienceCents)}</p> : null}
      <p className="font-semibold">
        Total <span data-testid="fee-total">{formatCents(baseCents + convenienceCents)}</span>
      </p>
    </section>
  )
}

export function PaymentSection({
  method,
  onMethod,
  cardAvailable,
  readerSimulated,
}: {
  method: Method
  onMethod: (method: Method) => void
  cardAvailable: boolean
  readerSimulated: boolean
}) {
  return (
    <section aria-labelledby="payment" className="space-y-3">
      <h2 id="payment">Payment</h2>
      <Labeled label="Payer name (defaults to the contractor)">
        <input name="payerName" className={CONTROL} />
      </Labeled>
      <fieldset className="flex gap-6">
        <legend className="text-sm font-medium">
          Method (Alt+1 cash, Alt+2 check, Alt+3 card)
        </legend>
        {METHODS.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="method"
              value={value}
              checked={method === value}
              disabled={value === 'card' && !cardAvailable}
              onChange={() => onMethod(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {cardAvailable ? null : <p>Card payments not configured.</p>}
      {method === 'card' && readerSimulated ? (
        <p className="rounded-md border p-2 text-sm font-semibold">
          SIMULATED card reader: this counter is not connected to a live processor. No card is
          charged.
        </p>
      ) : null}
      {method === 'cash' ? (
        <Labeled label="Cash tendered (dollars)">
          <input name="tendered" inputMode="decimal" className={CONTROL} />
        </Labeled>
      ) : null}
      {method === 'check' ? (
        <Labeled label="Check number">
          <input name="checkNumber" className={CONTROL} />
        </Labeled>
      ) : null}
    </section>
  )
}

export function IssuedNotice({ outcome }: { outcome: Extract<CounterOutcome, { ok: true }> }) {
  const links = outcome.links
  return (
    <p role="status">
      {outcome.number} is issued.{' '}
      {links === null ? null : (
        <>
          <a href={links.permit} target="_blank" rel="noopener noreferrer">
            Permit
          </a>{' '}
          <a href={links.placard} target="_blank" rel="noopener noreferrer">
            Placard
          </a>{' '}
          {links.receipt === null ? null : (
            <a href={links.receipt} target="_blank" rel="noopener noreferrer">
              Receipt
            </a>
          )}
        </>
      )}
    </p>
  )
}
