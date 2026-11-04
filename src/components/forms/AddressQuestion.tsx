'use client'

import type { ReactNode } from 'react'
import { AddressCheck } from '@/components/address/AddressCheck'
import { toSingleLine, toTextBlock } from '@/features/address/suggestionLayout'
import type { FormField } from '@/features/forms/formSchema'

const MOST_LINES_IN_A_BOX = 6

interface Props {
  field: FormField
  text: string
  onChange: (key: string, value: string) => void
  children: ReactNode
}

export function AddressQuestion({ field, text, onChange, children }: Props) {
  const box = field.type === 'textarea'
  return (
    <AddressCheck
      lines={box ? text.split('\n') : [text]}
      maxLines={box ? MOST_LINES_IN_A_BOX : 1}
      tapTarget
      className="grid gap-1.5"
      onUse={(lines) => onChange(field.key, box ? toTextBlock(lines) : toSingleLine(lines))}
    >
      {children}
    </AddressCheck>
  )
}
