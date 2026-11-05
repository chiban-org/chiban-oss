'use client'

import { ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { type ReactElement, useState } from 'react'
import { signOutAction } from '@/app/(staff)/staff/account/actions'
import { CsrfField } from '@/components/CsrfField'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isNested, type NavItem, type NavSection } from '@/features/staffNav/navItems'
import { cn } from '@/lib/utils'
import { NAV_ICON_COMPONENTS } from './navIcons'

export interface NavUser {
  name: string
  role: string
}

const ROW =
  'flex min-h-9 items-center gap-3 rounded-md text-sm font-medium text-ink-secondary no-underline transition-colors hover:bg-surface/70 hover:text-ink'

const CURRENT =
  'aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(31_31_31/0.06)]'

export function RailTip({
  label,
  rail,
  children,
}: {
  label: string
  rail: boolean
  children: ReactElement
}) {
  if (!rail) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function Label({ text, rail }: { text: string; rail: boolean }) {
  return <span className={rail ? 'sr-only' : 'truncate'}>{text}</span>
}

export function BrandMark({ town, rail = false }: { town: string | null; rail?: boolean }) {
  return (
    <RailTip label="Home" rail={rail}>
      <Link
        href="/staff"
        className={cn(
          'flex min-h-14 shrink-0 flex-col justify-center text-ink no-underline',
          rail ? 'items-center px-0' : 'px-3',
        )}
      >
        <span className="font-serif text-xl leading-tight font-semibold">
          {rail ? 'C' : 'Chiban'}
        </span>
        {rail || town === null ? null : (
          <span className="truncate text-xs text-muted-foreground">{town}</span>
        )}
        {rail ? <span className="sr-only">Chiban home</span> : null}
      </Link>
    </RailTip>
  )
}

function NavLink({
  item,
  nested,
  active,
  rail,
  onNavigate,
}: {
  item: NavItem
  nested: boolean
  active: string | null
  rail: boolean
  onNavigate?: () => void
}) {
  const Icon = NAV_ICON_COMPONENTS[item.icon]
  return (
    <RailTip label={item.label} rail={rail}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={item.href === active ? 'page' : undefined}
        className={cn(
          ROW,
          CURRENT,
          'group',
          rail ? 'justify-center px-0' : nested ? 'pr-3 pl-10' : 'px-3',
        )}
      >
        {nested && !rail ? null : (
          <Icon
            aria-hidden={true}
            className="size-4 shrink-0 text-muted-foreground group-hover:text-ink group-aria-[current=page]:text-action"
          />
        )}
        <Label text={item.label} rail={rail} />
      </Link>
    </RailTip>
  )
}

function SectionItems({
  section,
  all,
  active,
  rail,
  onNavigate,
}: {
  section: NavSection
  all: readonly NavItem[]
  active: string | null
  rail: boolean
  onNavigate?: () => void
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {section.items.map((item) => (
        <li key={item.href}>
          <NavLink
            item={item}
            nested={isNested(item, all)}
            active={active}
            rail={rail}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  )
}

export function NavSections({
  sections,
  all,
  active,
  rail = false,
  onNavigate,
}: {
  sections: NavSection[]
  all: readonly NavItem[]
  active: string | null
  rail?: boolean
  onNavigate?: () => void
}) {
  const [opened, setOpened] = useState<Partial<Record<string, boolean>>>({})
  return (
    <div className={cn('flex flex-col py-2', rail ? 'gap-2 px-2' : 'gap-4 px-3')}>
      {sections.map((section) => {
        const holdsActive = section.items.some((i) => i.href === active)
        const body = (
          <SectionItems
            section={section}
            all={all}
            active={active}
            rail={rail}
            onNavigate={onNavigate}
          />
        )
        if (rail) {
          return (
            <div
              key={section.key}
              className="flex flex-col gap-2 border-t border-hairline pt-2 first:border-t-0 first:pt-0"
            >
              {body}
            </div>
          )
        }
        if (section.label === null) return <div key={section.key}>{body}</div>
        if (!section.collapsible) {
          return (
            <div key={section.key}>
              <p className="mb-1 px-3 text-xs font-semibold text-muted-foreground">
                {section.label}
              </p>
              {body}
            </div>
          )
        }
        return (
          <details
            key={section.key}
            open={opened[section.key] ?? holdsActive}
            className="group/section"
          >
            <summary
              onClick={(event) => {
                event.preventDefault()
                const next = !(opened[section.key] ?? holdsActive)
                setOpened((current) => ({ ...current, [section.key]: next }))
              }}
              className="mb-1 flex w-full cursor-pointer list-none items-center justify-between rounded-md px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-ink [&::-webkit-details-marker]:hidden"
            >
              {section.label}
              <ChevronRight
                aria-hidden={true}
                className="size-3.5 transition-transform group-open/section:rotate-90"
              />
            </summary>
            {body}
          </details>
        )
      })}
    </div>
  )
}

export function NavFooter({
  user,
  active,
  rail = false,
  onToggleRail,
  onNavigate,
}: {
  user: NavUser
  active: string | null
  rail?: boolean
  onToggleRail?: () => void
  onNavigate?: () => void
}) {
  const ToggleIcon = rail ? PanelLeftOpen : PanelLeftClose
  const AccountIcon = NAV_ICON_COMPONENTS.account
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-0.5 border-t border-hairline py-3',
        rail ? 'px-2' : 'px-3',
      )}
    >
      {rail ? null : (
        <div className="mb-2 px-3">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.role}</p>
        </div>
      )}
      <RailTip label="Account" rail={rail}>
        <Link
          href="/staff/account"
          onClick={onNavigate}
          aria-current={active === '/staff/account' ? 'page' : undefined}
          className={cn(ROW, CURRENT, 'group', rail ? 'justify-center px-0' : 'px-3')}
        >
          <AccountIcon
            aria-hidden={true}
            className="size-4 shrink-0 text-muted-foreground group-hover:text-ink group-aria-[current=page]:text-action"
          />
          <Label text="Account" rail={rail} />
        </Link>
      </RailTip>
      <form action={signOutAction}>
        <CsrfField />
        <RailTip label="Sign out" rail={rail}>
          <button
            type="submit"
            className={cn(ROW, 'w-full cursor-pointer', rail ? 'justify-center px-0' : 'px-3')}
          >
            <LogOut aria-hidden={true} className="size-4 shrink-0 text-muted-foreground" />
            <Label text="Sign out" rail={rail} />
          </button>
        </RailTip>
      </form>
      {onToggleRail === undefined ? null : (
        <RailTip label="Expand the menu" rail={rail}>
          <button
            type="button"
            onClick={onToggleRail}
            aria-expanded={!rail}
            aria-label={rail ? 'Expand the menu' : 'Collapse the menu'}
            className={cn(ROW, 'mt-1 w-full cursor-pointer', rail ? 'justify-center px-0' : 'px-3')}
          >
            <ToggleIcon aria-hidden={true} className="size-4 shrink-0 text-muted-foreground" />
            <Label text={rail ? 'Expand' : 'Collapse'} rail={rail} />
          </button>
        </RailTip>
      )}
    </div>
  )
}
