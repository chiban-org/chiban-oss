'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { movedIndex } from '@/components/parcels/picker/pickerChoice'
import { Input } from '@/components/ui/input'
import { MIN_SEARCH_CHARS, type SearchResult } from '@/features/search/searchTypes'
import { cn } from '@/lib/utils'
import { type FindRecords, findRecords } from './findRecordsClient'
import { RecordSearchResults, recordOptionId } from './RecordSearchResults'
import { type SearchOptions, searchOptions } from './searchOptions'
import { type RecordSearchState, useRecordSearch } from './useRecordSearch'

export const RECORD_SEARCH_LABEL = 'Find a permit, case or parcel'

interface RecordSearchProps {
  placeholder?: string
  autoFocus?: boolean
  className?: string
  find?: FindRecords
}

const NO_OPTIONS: SearchOptions = { options: [], exactIndex: -1 }

function optionsFor(state: RecordSearchState, query: string): SearchOptions {
  if (state.phase !== 'done' || state.query !== query.trim()) return NO_OPTIONS
  return searchOptions(state.result)
}

async function resultFor(
  state: RecordSearchState,
  query: string,
  find: FindRecords,
  signal: AbortSignal,
): Promise<SearchResult | null> {
  if (state.phase === 'done' && state.query === query) return state.result
  return await find(query, signal).catch(() => null)
}

function openInNewTab(href: string): boolean {
  const tab = window.open(href, '_blank')
  if (tab === null) return false
  tab.opener = null
  return true
}

export function RecordSearch({
  placeholder = RECORD_SEARCH_LABEL,
  autoFocus = false,
  className,
  find = findRecords,
}: RecordSearchProps) {
  const router = useRouter()
  const inputId = useId()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const pending = useRef<AbortController | null>(null)
  const state = useRecordSearch(find, query)
  const { options, exactIndex } = optionsFor(state, query)
  const active = picked ?? exactIndex
  const expanded = open && state.phase !== 'idle'
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  useEffect(() => {
    if (expanded && active >= 0)
      document.getElementById(recordOptionId(listId, active))?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active, listId])
  const cancelPending = () => {
    pending.current?.abort()
    pending.current = null
  }
  useEffect(() => cancelPending, [])
  const go = (href: string, newTab: boolean) => {
    if (newTab && !openInNewTab(href)) {
      setOpen(true)
      return
    }
    if (!newTab) router.push(href)
    setQuery('')
    setOpen(false)
  }
  const submit = async () => {
    const chosen = expanded && active >= 0 ? options.at(active) : undefined
    if (chosen !== undefined) return go(chosen.href, chosen.newTab)
    const trimmed = query.trim()
    if (trimmed.length < MIN_SEARCH_CHARS) return
    cancelPending()
    const controller = new AbortController()
    pending.current = controller
    const exact = (await resultFor(state, trimmed, find, controller.signal))?.exact ?? null
    if (controller.signal.aborted) return
    pending.current = null
    if (exact === null) setOpen(true)
    else go(exact.href, exact.newTab)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moved = movedIndex(event.key, active, options.length)
    if (moved !== null) {
      event.preventDefault()
      setOpen(true)
      setPicked(moved)
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      cancelPending()
      setOpen(false)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }
  return (
    <PopoverPrimitive.Root open={expanded} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div role="search" className={cn('relative', className)}>
          <label htmlFor={inputId} className="sr-only">
            {RECORD_SEARCH_LABEL}
          </label>
          <Search
            aria-hidden={true}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-haspopup="listbox"
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={
              expanded && active >= 0 ? recordOptionId(listId, active) : undefined
            }
            placeholder={placeholder}
            value={query}
            className="border-control-border pl-8"
            onChange={(event) => {
              cancelPending()
              setQuery(event.target.value)
              setPicked(null)
              setOpen(event.target.value.trim().length >= MIN_SEARCH_CHARS)
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(query.trim().length >= MIN_SEARCH_CHARS)}
          />
        </div>
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
          className="z-50 max-h-[min(32rem,70vh)] w-[min(28rem,calc(100vw-1rem))] overflow-y-auto rounded-md border border-hairline bg-surface p-1 text-ink shadow-sm"
        >
          <RecordSearchResults
            listId={listId}
            state={state}
            options={options}
            active={active}
            onHover={setPicked}
            onPick={(option) => go(option.href, option.newTab)}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
