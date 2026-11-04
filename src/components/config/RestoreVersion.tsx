'use client'

import { useState } from 'react'
import { rollbackAction } from '@/app/(staff)/staff/settings/actions'
import { ActionForm } from '@/components/ActionForm'
import { publishImpact } from '@/components/config/PublishBar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ConfigKind } from '@/features/config/kinds'

export function RestoreVersion({
  kind,
  configKey,
  version,
  pinned,
}: {
  kind: ConfigKind
  configKey: string
  version: number
  pinned: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = `Restore version ${String(version)}`
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`${label}?`}</DialogTitle>
            <DialogDescription>
              {`Version ${String(version)} is published again as a new version, replacing what is published now. ${publishImpact(pinned)}`}
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={rollbackAction} submitLabel={label} variant="default">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="key" value={configKey} />
            <input type="hidden" name="toVersion" value={version} />
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  )
}
