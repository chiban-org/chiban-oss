'use client'

import { type ReactNode, useState } from 'react'
import { DialogCloseProvider } from '@/components/dialogCloseContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export interface FormDialogProps {
  label: string
  title: string
  description?: string
  accessibleLabel?: string
  variant?: 'default' | 'outline'
  size?: 'default' | 'sm'
  defaultOpen?: boolean
  children: ReactNode
}

export function FormDialog({
  label,
  title,
  description,
  accessibleLabel,
  variant = 'outline',
  size = 'default',
  defaultOpen = false,
  children,
}: FormDialogProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} aria-label={accessibleLabel}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogCloseProvider value={() => setOpen(false)}>{children}</DialogCloseProvider>
      </DialogContent>
    </Dialog>
  )
}

export function RowEditDialog({
  record,
  title,
  description,
  children,
}: {
  record: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <FormDialog
      label="Edit"
      accessibleLabel={`Edit ${record}`}
      title={title}
      size="sm"
      {...(description === undefined ? {} : { description })}
    >
      {children}
    </FormDialog>
  )
}
