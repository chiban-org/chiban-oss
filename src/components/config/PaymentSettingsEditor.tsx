'use client'

import { Check, Input } from '@/components/config/primitives'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'

interface Props {
  body: PaymentSettingsBody
  onChange: (next: PaymentSettingsBody) => void
}

const CHANNELS = [
  ['card_online', 'Online card payments'],
  ['card_present', 'Card payments at the counter'],
] as const

function toWholeNumber(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function PaymentSettingsEditor({ body, onChange }: Props) {
  const fee = body.convenienceFee
  const setFee = (next: Partial<typeof fee>) =>
    onChange({ ...body, convenienceFee: { ...fee, ...next } })
  return (
    <div className="space-y-3">
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Convenience fee passed to the payer</legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Basis points (100 is 1 percent)"
            type="number"
            min={0}
            value={fee.basisPoints}
            onChange={(e) => setFee({ basisPoints: toWholeNumber(e.target.value) })}
          />
          <Input
            label="Fixed amount in cents"
            type="number"
            min={0}
            value={fee.fixedCents}
            onChange={(e) => setFee({ fixedCents: toWholeNumber(e.target.value) })}
          />
        </div>
        <div className="mt-2 space-y-1">
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
      </fieldset>
      <Input
        label="Checks payable to"
        value={body.checksPayableTo}
        onChange={(e) => onChange({ ...body, checksPayableTo: e.target.value })}
      />
      <Input
        label="Receipt footer"
        value={body.receiptFooter}
        onChange={(e) => onChange({ ...body, receiptFooter: e.target.value })}
      />
    </div>
  )
}
