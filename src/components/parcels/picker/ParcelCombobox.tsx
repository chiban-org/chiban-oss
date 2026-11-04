'use client'

import { Popover as PopoverPrimitive } from 'radix-ui'
import { type KeyboardEvent, type RefObject, useEffect, useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { optionId, ParcelOptions } from './ParcelOptions'
import {
  MIN_PICK_QUERY,
  movedIndex,
  optionsFor,
  type ParcelSearch,
  type PickerChoice,
} from './pickerChoice'
import { useFormReset } from './useFormReset'
import { type SearchState, useParcelSearch } from './useParcelSearch'

export const UNCHOSEN_COPY = 'Choose a parcel from the list.'

interface ParcelComboboxProps {
  id: string
  inputRef: RefObject<HTMLInputElement | null>
  search: ParcelSearch
  allowUnknown: boolean
  required: boolean
  describedBy?: string | undefined
  className?: string | undefined
  onPick: (choice: PickerChoice) => void
}

function currentOptions(state: SearchState, query: string, allowUnknown: boolean): PickerChoice[] {
  if (state.phase !== 'done' || state.query !== query.trim()) return []
  return optionsFor(state.hits, query, allowUnknown)
}

export function ParcelCombobox({
  id,
  inputRef,
  search,
  allowUnknown,
  required,
  describedBy,
  className,
  onPick,
}: ParcelComboboxProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const state = useParcelSearch(search, query)
  const options = currentOptions(state, query, allowUnknown)
  const expanded = open && state.phase !== 'idle'
  useFormReset(inputRef, () => setQuery(''))
  useEffect(() => {
    inputRef.current?.setCustomValidity(query.trim() === '' ? '' : UNCHOSEN_COPY)
  }, [inputRef, query])
  useEffect(() => {
    if (expanded && active >= 0)
      document.getElementById(optionId(listId, active))?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active, listId])
  const pick = (choice: PickerChoice) => {
    setQuery('')
    setOpen(false)
    onPick(choice)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moved = movedIndex(event.key, active, options.length)
    if (moved !== null) {
      event.preventDefault()
      setOpen(true)
      setActive(moved)
      return
    }
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (event.key !== 'Enter' || query.trim() === '') return
    event.preventDefault()
    const chosen = expanded && active >= 0 ? options.at(active) : undefined
    if (chosen !== undefined) pick(chosen)
  }
  return (
    <PopoverPrimitive.Root open={expanded} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <Input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-haspopup="listbox"
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && active >= 0 ? optionId(listId, active) : undefined}
          aria-describedby={describedBy}
          placeholder="Address, owner, or parcel ID"
          required={required}
          value={query}
          className={className}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(-1)
            setOpen(event.target.value.trim().length >= MIN_PICK_QUERY)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
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
          <ParcelOptions
            listId={listId}
            state={state}
            options={options}
            active={active}
            onHover={setActive}
            onPick={pick}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
