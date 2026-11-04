'use client'

import { AddressCheck } from '@/components/address/AddressCheck'
import { AreaField } from '@/components/staff/fields'
import { toTextBlock } from '@/features/address/suggestionLayout'

const MOST_LINES_IN_A_BOX = 6

interface Props {
  label: string
  rows: number
  value: string
  onValue: (value: string) => void
}

export function AddressAreaField({ label, rows, value, onValue }: Props) {
  return (
    <AddressCheck
      lines={value.split('\n')}
      maxLines={MOST_LINES_IN_A_BOX}
      onUse={(lines) => onValue(toTextBlock(lines))}
      className="grid gap-1.5"
    >
      <AreaField
        label={label}
        rows={rows}
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
    </AddressCheck>
  )
}
