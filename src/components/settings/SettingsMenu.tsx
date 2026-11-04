'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  filterSettingsSections,
  type SettingsMenuSection,
} from '@/features/settingsMenu/settingsMenu'
import { activeHref } from '@/features/staffNav/access'

const ROW =
  'flex min-h-9 items-center rounded-md px-3 text-sm font-medium text-ink-secondary no-underline transition-colors hover:bg-surface/70 hover:text-ink'

const CURRENT =
  'aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(31_31_31/0.06)]'

function MenuList({
  sections,
  active,
}: {
  sections: readonly SettingsMenuSection[]
  active: string | null
}) {
  if (sections.length === 0) {
    return <p className="m-0 px-3 py-2 text-sm text-muted-foreground">No settings match.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.key}>
          <p className="m-0 mb-1 px-3 text-xs font-semibold text-muted-foreground">
            {section.label}
          </p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
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
        </div>
      ))}
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
        className="no-print hidden w-56 shrink-0 flex-col gap-3 self-start md:flex"
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
        <MenuList sections={filterSettingsSections(sections, query)} active={active} />
      </nav>
    </>
  )
}
