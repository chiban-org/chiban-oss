'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { TakeCloseProvider, useTakeStatus } from '@/components/inspections/takeRequestContext'
import { Button } from '@/components/ui/button'

const PANEL_ID = 'take-request-panel'

export function TakeRequestPanel({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const status = useTakeStatus()
  const router = useRouter()
  const closeAfterTaking = () => {
    setOpen(false)
    if (defaultOpen) router.replace('/staff/inspections', { scroll: false })
  }
  return (
    <section aria-label="Take a request" id="take-request" className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          className="min-h-11 text-base"
          onClick={() => setOpen((current) => !current)}
        >
          Take a phone or counter request
        </Button>
        <p role="status" className="m-0 font-semibold empty:hidden">
          {status}
        </p>
      </div>
      {open ? (
        <div id={PANEL_ID} className="flex max-w-2xl flex-col gap-4 border-t border-hairline pt-4">
          <h2 className="m-0">Take a request</h2>
          <TakeCloseProvider value={closeAfterTaking}>{children}</TakeCloseProvider>
        </div>
      ) : null}
    </section>
  )
}
