'use client'

import {
  Banknote,
  ChevronRight,
  FileText,
  Gavel,
  Landmark,
  LayoutTemplate,
  type LucideIcon,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  filterSettingsSections,
  type SettingsGroupKey,
  type SettingsMenuSection,
} from '@/features/settingsMenu/settingsMenu'
import { activeHref } from '@/features/staffNav/access'

const ROW =
  'flex min-h-8 items-center rounded-md py-1 pr-3 pl-9 text-sm text-ink-secondary no-underline transition-colors hover:bg-surface/70 hover:text-ink'

const CURRENT =
  'aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(31_31_31/0.06)]'

const GROUP_ICONS: Record<SettingsGroupKey, LucideIcon> = {
  town: Landmark,
  permits: FileText,
  townRules: Scale,
  boards: Gavel,
  money: Banknote,
  starters: LayoutTemplate,
  admin: ShieldCheck,
}

function groupOf(sections: readonly SettingsMenuSection[], href: string | null) {
  return sections.find((s) => s.items.some((i) => i.href === href))?.key ?? null
}

function GroupHeading({
  section,
  open,
  onToggle,
}: {
  section: SettingsMenuSection
  open: boolean
  onToggle: () => void
}) {
  const Icon = GROUP_ICONS[section.key]
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex min-h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-ink hover:bg-surface/70"
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">{section.label}</span>
      {open ? null : (
        <span className="text-xs font-normal text-muted-foreground">{section.items.length}</span>
      )}
      <ChevronRight
        aria-hidden
        className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
      />
    </button>
  )
}

function MenuList({
  sections,
  active,
  filtering,
}: {
  sections: readonly SettingsMenuSection[]
  active: string | null
  filtering: boolean
}) {
  const current = groupOf(sections, active)
  const [opened, setOpened] = useState<ReadonlySet<string>>(
    () => new Set(current === null ? [] : [current]),
  )
  const [shownGroup, setShownGroup] = useState(current)
  if (current !== shownGroup) {
    setShownGroup(current)
    if (current !== null && !opened.has(current)) setOpened(new Set([...opened, current]))
  }
  if (sections.length === 0) {
    return <p className="m-0 px-3 py-2 text-sm text-muted-foreground">No settings match.</p>
  }
  const toggle = (key: string) =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <div className="flex flex-col gap-1">
      {sections.map((section) => {
        const open = filtering || opened.has(section.key)
        return (
          <div key={section.key}>
            <GroupHeading section={section} open={open} onToggle={() => toggle(section.key)} />
            {open ? (
              <ul className="m-0 mt-0.5 mb-2 flex list-none flex-col gap-0.5 p-0">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={item.href === active ? 'page' : undefined}
                      className={`${ROW} ${CURRENT}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function MenuPicker({
  sections,
  active,
}: {
  sections: readonly SettingsMenuSection[]
  active: string | null
}) {
  const router = useRouter()
  const id = useId()
  return (
    <div className="mb-6 flex flex-col gap-1.5 md:hidden">
      <Label htmlFor={id}>Settings page</Label>
      <NativeSelect
        id={id}
        value={active ?? ''}
        onChange={(event) => router.push(event.target.value)}
      >
        {active === null ? (
          <NativeSelectOption value="" disabled>
            Choose a settings page
          </NativeSelectOption>
        ) : null}
        {sections.map((section) => (
          <optgroup key={section.key} label={section.label}>
            {section.items.map((item) => (
              <NativeSelectOption key={item.href} value={item.href}>
                {item.label}
              </NativeSelectOption>
            ))}
          </optgroup>
        ))}
      </NativeSelect>
    </div>
  )
}

export function SettingsMenu({ sections }: { sections: readonly SettingsMenuSection[] }) {
  const active = activeHref(
    usePathname(),
    sections.flatMap((s) => s.items),
  )
  const [query, setQuery] = useState('')
  const filterId = useId()
  return (
    <>
      <MenuPicker sections={sections} active={active} />
      <nav
        aria-label="Settings"
        className="no-print hidden w-60 shrink-0 flex-col gap-3 self-start md:flex"
      >
        <label htmlFor={filterId} className="sr-only">
          Filter settings
        </label>
        <Input
          id={filterId}
          type="search"
          placeholder="Filter settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="bg-surface"
        />
        <MenuList
          sections={filterSettingsSections(sections, query)}
          active={active}
          filtering={query.trim() !== ''}
        />
      </nav>
    </>
  )
}
