'use client'

import { type ReactNode, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmCopy {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'destructive' | 'default'
}

export function ConfirmDialog({
  open,
  copy,
  onConfirm,
  onCancel,
  returnFocusTo,
  children,
}: {
  open: boolean
  copy: ConfirmCopy
  onConfirm: () => void
  onCancel: () => void
  returnFocusTo?: () => HTMLElement | null
  children?: ReactNode
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent
        showCloseButton={false}
        className="bg-surface"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancel.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.() ?? null
          if (target === null) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-serif text-xl">{copy.title}</DialogTitle>
          <DialogDescription className="text-ink-secondary">{copy.body}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="flex-row flex-wrap justify-end">
          <Button ref={cancel} type="button" variant="outline" onClick={onCancel}>
            {copy.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            type="button"
            variant={copy.tone === 'default' ? 'default' : 'destructive'}
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
