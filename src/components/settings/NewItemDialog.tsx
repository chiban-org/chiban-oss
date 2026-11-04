'use client'

import type { ReactNode } from 'react'
import { FormDialog } from '@/components/FormDialog'

export function NewItemDialog({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: ReactNode
}) {
  return (
    <FormDialog label={label} title={label} description={description} variant="default">
      {children}
    </FormDialog>
  )
}
