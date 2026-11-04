'use client'

import { ClaimLinkButton } from '@/components/counter/ClaimLinkButton'
import type { CounterActions, CounterOutcome } from '@/components/counter/counterTypes'
import { NEW_TAB } from '@/components/newTab'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { formatCents } from '@/lib/money'

export type Method = 'cash' | 'check' | 'card'

export interface WorkField {
  key: string
  label: string
  type: string
  required: boolean
  options?: { value: string; label: string }[]
}

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

function WorkInput({ field }: { field: WorkField }) {
  const name = `value.${field.key}`
  if (field.type === 'textarea') {
    return <AreaField label={field.label} name={name} required={field.required} rows={3} />
  }
  if (field.type === 'checkbox') return <CheckField label={field.label} name={name} />
  if (field.type === 'select') {
    return (
      <SelectField
        label={field.label}
        name={name}
        required={field.required}
        options={[['', ''], ...(field.options ?? []).map((o) => [o.value, o.label] as const)]}
      />
    )
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'
  return <TextField label={field.label} type={inputType} name={name} required={field.required} />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Contractor name" name="contractorName" required />
        <TextField label="Contractor email" type="email" name="contractorEmail" />
        <TextField label="License number" name="licenseNumber" required />
        <TextField
          label="License type"
          name="licenseType"
          required
          defaultValue={defaultLicenseType}
        />
        <SelectField
          label="Result of the state lookup"
          name="licenseResult"
          defaultValue="active"
          options={RESULTS}
        />
        <TextField label="Note" name="licenseNote" />
      </div>
      <a href={lookup.url} {...NEW_TAB}>
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
        <WorkInput key={field.key} field={field} />
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
      <TextField label="Payer name (defaults to the contractor)" name="payerName" />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Method</legend>
        <RadioGroup
          name="method"
          value={method}
          onValueChange={(next) => onMethod(next as Method)}
          className="flex gap-6"
        >
          {METHODS.map(([value, label]) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem
                id={`method-${value}`}
                value={value}
                disabled={value === 'card' && !cardAvailable}
              />
              <Label htmlFor={`method-${value}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      {cardAvailable ? null : <p>Card payments not configured.</p>}
      {method === 'card' && readerSimulated ? (
        <p className="rounded-md border p-2 text-sm font-semibold">
          SIMULATED card reader: this counter is not connected to a live processor. No card is
          charged.
        </p>
      ) : null}
      {method === 'cash' ? (
        <TextField label="Cash tendered (dollars)" name="tendered" inputMode="decimal" />
      ) : null}
      {method === 'check' ? <TextField label="Check number" name="checkNumber" /> : null}
    </section>
  )
}

export function IssuedNotice({
  outcome,
  claim,
}: {
  outcome: Extract<CounterOutcome, { ok: true }>
  claim?: CounterActions['claim']
}) {
  const links = outcome.links
  return (
    <div className="space-y-3">
      <p role="status">
        {outcome.number} is issued.{' '}
        {links === null ? null : (
          <>
            <a href={links.permit} {...NEW_TAB}>
              Permit
            </a>{' '}
            <a href={links.placard} {...NEW_TAB}>
              Placard
            </a>{' '}
            {links.receipt === null ? null : (
              <a href={links.receipt} {...NEW_TAB}>
                Receipt
              </a>
            )}
          </>
        )}
      </p>
      {claim === undefined ? null : (
        <ClaimLinkButton applicationId={outcome.applicationId} send={claim} />
      )}
    </div>
  )
}
