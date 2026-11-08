'use client'

import { Popover as PopoverPrimitive } from 'radix-ui'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useControlAria } from '@/components/fieldErrors'
import { movedIndex } from '@/components/parcels/picker/pickerChoice'
import { useFormReset } from '@/components/parcels/picker/useFormReset'
import { Field } from '@/components/staff/fields'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/components/useHydrated'
import {
  chipsOf,
  type SectionSuggestion,
  searchSuggestions,
} from '@/features/enforcement/sections/suggestions'
import { cn } from '@/lib/utils'
import { SectionChips, SectionOptions, sectionOptionId } from './SectionOptions'

const NAME = 'provisionRef'
const HINT = 'Tap a common section, or type to search. A section not on any list is saved as typed.'

interface Props {
  suggestions: readonly SectionSuggestion[]
  defaultValue?: string
}

function useListState(suggestions: readonly SectionSuggestion[], query: string) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const options = searchSuggestions(suggestions, query)
  const expanded = open && options.length > 0
  return { open, setOpen, active, setActive, options, expanded }
}

export function SectionCombobox({ suggestions, defaultValue = '' }: Props) {
  const hydrated = useHydrated()
  const id = useId()
  const listId = useId()
  const hintId = `${id}-hint`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState(defaultValue)
  const list = useListState(suggestions, value)
  const { error, aria } = useControlAria(NAME, hintId)
  useFormReset(inputRef, () => setValue(defaultValue))
  useEffect(() => {
    if (list.expanded && list.active >= 0)
      document
        .getElementById(sectionOptionId(listId, list.active))
        ?.scrollIntoView({ block: 'nearest' })
  }, [list.expanded, list.active, listId])
  const pick = (s: SectionSuggestion) => {
    setValue(s.value)
    list.setOpen(false)
    list.setActive(-1)
    inputRef.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moved = movedIndex(event.key, list.active, list.options.length)
    if (moved !== null) {
      event.preventDefault()
      list.setOpen(true)
      list.setActive(moved)
      return
    }
    if (event.key === 'Escape' && list.expanded) {
      event.preventDefault()
      event.stopPropagation()
      list.setOpen(false)
      return
    }
    const chosen = list.expanded && list.active >= 0 ? list.options.at(list.active) : undefined
    if (event.key === 'Enter' && chosen !== undefined) {
      event.preventDefault()
      pick(chosen)
    }
  }
  const combobox = hydrated
    ? {
        role: 'combobox',
        'aria-autocomplete': 'list' as const,
        'aria-expanded': list.expanded,
        'aria-haspopup': 'listbox' as const,
        'aria-controls': list.expanded ? listId : undefined,
        'aria-activedescendant':
          list.expanded && list.active >= 0 ? sectionOptionId(listId, list.active) : undefined,
      }
    : {}
  return (
    <Field
      label="Section or condition"
      htmlFor={id}
      hint={HINT}
      hintId={hintId}
      required
      error={error}
    >
      {hydrated ? <SectionChips chips={chipsOf(suggestions)} onPick={pick} /> : null}
      <PopoverPrimitive.Root open={list.expanded} onOpenChange={list.setOpen}>
        <PopoverPrimitive.Anchor asChild>
          <Input
            ref={inputRef}
            id={id}
            name={NAME}
            type="text"
            autoComplete="off"
            required
            maxLength={300}
            value={value}
            {...aria}
            {...combobox}
            onChange={(event) => {
              setValue(event.target.value)
              list.setActive(-1)
              list.setOpen(event.target.value.trim() !== '')
            }}
            onKeyDown={onKeyDown}
            onBlur={() => list.setOpen(false)}
          />
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (event.target === inputRef.current) event.preventDefault()
            }}
            role="presentation"
            className={cn(
              'z-50 w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-2rem)]',
              'max-h-96 overflow-y-auto rounded-md border border-hairline bg-surface p-1 text-ink shadow-sm',
            )}
          >
            <SectionOptions
              listId={listId}
              options={list.options}
              active={list.active}
              onHover={list.setActive}
              onPick={pick}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </Field>
  )
}
