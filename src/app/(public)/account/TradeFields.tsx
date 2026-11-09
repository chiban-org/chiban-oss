'use client'

import { useState } from 'react'
import { TextField } from '@/components/staff/fields'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { licenseFieldName } from '@/features/contractors/profileForm'
import { CONTRACTOR_TRADES } from '@/features/contractors/trades'

interface TradeFieldsProps {
  trades: string[]
  licenses: { trade: string; number: string }[]
}

export function TradeFields({ trades, licenses }: TradeFieldsProps) {
  const [checked, setChecked] = useState<string[]>(trades)
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(licenses.map((l) => [l.trade, l.number])),
  )
  const toggle = (trade: string, on: boolean) =>
    setChecked((held) => (on ? [...held, trade] : held.filter((t) => t !== trade)))
  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="font-medium">Trades</legend>
      <p className="text-muted-foreground">
        Choose the licensed trades you work in. Leave them all clear if you do general building
        work.
      </p>
      {CONTRACTOR_TRADES.map((t) => {
        const on = checked.includes(t.trade)
        return (
          <div key={t.trade} className="space-y-3">
            <div className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={`trade-${t.trade}`}
                name="trades"
                value={t.trade}
                checked={on}
                onCheckedChange={(next) => toggle(t.trade, next === true)}
                className="size-5 min-h-0! min-w-0!"
              />
              <Label htmlFor={`trade-${t.trade}`} className="font-normal">
                {t.label}
              </Label>
            </div>
            {on ? (
              <div className="max-w-sm pl-8">
                <TextField
                  label={`NH license number, ${t.label.toLowerCase()}`}
                  name={licenseFieldName(t.trade)}
                  autoComplete="off"
                  value={numbers[t.trade] ?? ''}
                  onChange={(event) =>
                    setNumbers((held) => ({ ...held, [t.trade]: event.target.value }))
                  }
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </fieldset>
  )
}
