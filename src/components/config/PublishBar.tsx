'use client'

import { type ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const DRAFT_LINE =
  'Save draft keeps your changes without using them yet. Publish makes them the version Chiban uses.'

export function publishImpact(pinned: boolean): string {
  return pinned
    ? 'New applications use the published version from now on. Open applications keep the version they started under.'
    : 'Chiban starts using it as soon as you publish.'
}

export function PublishBar({
  pinned,
  disabled,
  status,
  extra,
}: {
  pinned: boolean
  disabled: boolean
  status: string | null
  extra?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const submitter = useRef<HTMLButtonElement>(null)
  const confirm = () => {
    setOpen(false)
    const button = submitter.current
    button?.form?.requestSubmit(button)
  }
  return (
    <div className="mt-6 grid gap-2">
      <p className="m-0 max-w-[75ch] text-sm text-muted-foreground">{DRAFT_LINE}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
          Publish
        </Button>
        <button ref={submitter} type="submit" name="intent" value="publish" hidden tabIndex={-1} />
        <Button type="submit" name="intent" value="save" variant="outline" disabled={disabled}>
          Save draft
        </Button>
        {extra}
        <p role="status" className="m-0 text-sm">
          {status}
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish these changes?</DialogTitle>
            <DialogDescription>{publishImpact(pinned)}</DialogDescription>
          </DialogHeader>
          <p className="m-0 text-sm">
            You can restore an earlier version from the version history later.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep editing
            </Button>
            <Button type="button" onClick={confirm}>
              Publish now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
