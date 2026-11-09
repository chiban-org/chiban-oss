'use client'

import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function MenuDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [openedAt, setOpenedAt] = useState(pathname)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  if (openedAt !== pathname) {
    setOpenedAt(pathname)
    setOpen(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open || event.key !== 'Escape') return
    setOpen(false)
    button.current?.focus()
  }
  return (
    <div className="contents" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-control-border bg-surface px-3 font-semibold text-ink md:hidden"
      >
        {open ? (
          <X aria-hidden={true} className="size-5" />
        ) : (
          <Menu aria-hidden={true} className="size-5" />
        )}
        Menu
      </button>
      <div
        id={panelId}
        className={cn(
          open ? 'flex' : 'hidden',
          'basis-full flex-col gap-2 border-t border-hairline py-2 md:contents',
        )}
      >
        {children}
      </div>
    </div>
  )
}
