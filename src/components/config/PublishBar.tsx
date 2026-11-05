'use client'

import { type ReactNode, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { invalidFieldsText } from '@/components/config/formValidity'
import { Button } from '@/components/ui/button'

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
  const [blocked, setBlocked] = useState<string | null>(null)
  const submitter = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const ask = () => {
    const form = trigger.current?.form ?? null
    const problem = form === null ? null : invalidFieldsText(form)
    setBlocked(problem)
    if (problem === null) setOpen(true)
    else form?.reportValidity()
  }
  const confirm = () => {
    setOpen(false)
    const button = submitter.current
    button?.form?.requestSubmit(button)
  }
  return (
    <div className="mt-6 grid gap-2">
      <p className="m-0 max-w-[75ch] text-sm text-muted-foreground">{DRAFT_LINE}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button ref={trigger} type="button" disabled={disabled} onClick={ask}>
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
      {blocked === null ? null : (
        <p role="alert" className="m-0 text-sm text-status-failed-fg">
          {blocked}
        </p>
      )}
      <ConfirmDialog
        open={open}
        copy={{
          title: 'Publish these changes?',
          body: `${publishImpact(pinned)} You can restore an earlier version from the version history later.`,
          confirmLabel: 'Publish now',
          cancelLabel: 'Keep editing',
          tone: 'default',
        }}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        returnFocusTo={() => trigger.current}
      />
    </div>
  )
}
