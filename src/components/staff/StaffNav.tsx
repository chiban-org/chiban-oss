'use client'

import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { STAFF_NAV_COOKIE } from '@/constants/cookies'
import { activeNavHref, groupNavItems, type NavItem } from '@/features/staffNav/navItems'
import { cn } from '@/lib/utils'
import { BrandMark, NavFooter, NavSections, type NavUser } from './StaffNavBody'

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

interface StaffNavProps {
  items: NavItem[]
  town: string | null
  user: NavUser
  initialRail: boolean
}

function rememberRail(rail: boolean) {
  document.cookie = `${STAFF_NAV_COOKIE}=${rail ? 'rail' : 'full'}; path=/staff; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
}

function MobileNav({
  town,
  children,
}: {
  town: string | null
  children: (close: () => void) => ReactNode
}) {
  const drawer = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const close = () => drawer.current?.close()
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      if (wide.matches) drawer.current?.close()
    }
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])
  return (
    <div className="no-print sticky top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-sidebar px-2 md:hidden">
      <BrandMark town={town} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open the menu"
        onClick={() => {
          setOpen(true)
          drawer.current?.showModal()
        }}
        className="size-11 text-ink hover:bg-surface"
      >
        <Menu aria-hidden={true} className="size-5" />
      </Button>
      <dialog
        ref={drawer}
        aria-label="Staff menu"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-hairline bg-sidebar p-0 backdrop:bg-ink/40"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between pr-2">
            <BrandMark town={town} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close the menu"
              autoFocus
              onClick={close}
              className="size-11 text-ink hover:bg-surface"
            >
              <X aria-hidden={true} className="size-5" />
            </Button>
          </div>
          {open ? children(close) : null}
        </div>
      </dialog>
    </div>
  )
}

export function StaffNav({ items, town, user, initialRail }: StaffNavProps) {
  const active = activeNavHref(usePathname(), items)
  const [rail, setRail] = useState(initialRail)
  const sections = groupNavItems(items).filter((section) => section.key !== 'account')
  const toggleRail = () => {
    rememberRail(!rail)
    setRail(!rail)
  }
  const body = (isRail: boolean, onNavigate?: () => void, onToggleRail?: () => void) => (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavSections
          sections={sections}
          all={items}
          active={active}
          rail={isRail}
          onNavigate={onNavigate}
        />
      </div>
      <NavFooter
        user={user}
        active={active}
        rail={isRail}
        onToggleRail={onToggleRail}
        onNavigate={onNavigate}
      />
    </>
  )
  return (
    <>
      <MobileNav town={town}>{(close) => body(false, close)}</MobileNav>
      <nav
        aria-label="Staff"
        className={cn(
          'no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 ease-out md:flex',
          rail ? 'w-16' : 'w-64',
        )}
      >
        <div className={cn('pt-3 pb-2', rail ? 'px-2' : 'px-3')}>
          <BrandMark town={town} rail={rail} />
        </div>
        {body(rail, undefined, toggleRail)}
      </nav>
    </>
  )
}
