'use client'

import { DollarsInput, PercentInput } from '@/components/config/plainFields'
import { Check, Input } from '@/components/config/primitives'
import { Legend } from '@/components/ui/legend'
import { convenienceExample } from '@/features/payments/feeInputs'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'

interface Props {
  body: PaymentSettingsBody
  onChange: (next: PaymentSettingsBody) => void
}

const CHANNELS = [
  ['card_online', 'Online card payments'],
  ['card_present', 'Card payments at the counter'],
] as const

export function PaymentSettingsEditor({ body, onChange }: Props) {
  const fee = body.convenienceFee
  const setFee = (next: Partial<typeof fee>) =>
    onChange({ ...body, convenienceFee: { ...fee, ...next } })
  return (
    <div className="space-y-3">
      <fieldset className="rounded-md border p-3">
        <Legend bordered>Convenience fee passed to the payer</Legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <PercentInput
            label="Percent of the payment"
            basisPoints={fee.basisPoints}
            onBasisPoints={(basisPoints) => setFee({ basisPoints })}
          />
          <DollarsInput
            label="Plus a set amount"
            cents={fee.fixedCents}
            onCents={(fixedCents) => setFee({ fixedCents })}
          />
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium">Charge it on</p>
          {CHANNELS.map(([channel, label]) => (
            <Check
              key={channel}
              label={label}
              checked={fee.appliesTo.includes(channel)}
              onChange={(checked) =>
                setFee({
                  appliesTo: checked
                    ? [...fee.appliesTo, channel]
                    : fee.appliesTo.filter((c) => c !== channel),
                })
              }
            />
          ))}
        </div>
        <p className="m-0 mt-3 text-sm" aria-live="polite">
          {convenienceExample(fee)}
        </p>
      </fieldset>
      <Input
        label="Checks payable to"
        hint="Printed on invoices and receipts, for example Town of Alder Pond."
        value={body.checksPayableTo}
        onChange={(e) => onChange({ ...body, checksPayableTo: e.target.value })}
      />
      <Input
        label="Receipt footer"
        hint="A line printed at the bottom of every receipt."
        value={body.receiptFooter}
        onChange={(e) => onChange({ ...body, receiptFooter: e.target.value })}
      />
    </div>
  )
}
