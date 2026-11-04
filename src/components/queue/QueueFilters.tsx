'use client'

import type { ChangeEvent } from 'react'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { QUEUE_SEARCH_ID } from '@/components/queue/useQueueKeys'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ChipGroupView } from '@/features/dataTable/quickFilters'

function submitOnChange(event: ChangeEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLInputElement && event.target.type === 'search') return
  event.currentTarget.requestSubmit()
}

interface Props {
  search: string
  carried: [string, string][]
  chips: ChipGroupView[]
  clearHref: string | null
}

export function QueueFilters({ search, carried, chips, clearHref }: Props) {
  return (
    <div className="toolbar mb-5 flex flex-wrap items-center gap-x-3 gap-y-3">
      <form
        method="get"
        role="search"
        aria-label="Filter applications"
        onChange={submitOnChange}
        className="flex flex-wrap items-center gap-2"
      >
        <Label htmlFor={QUEUE_SEARCH_ID} className="sr-only">
          Search by number
        </Label>
        <Input
          id={QUEUE_SEARCH_ID}
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by number"
          className="w-48"
        />
        {carried.map(([name, value]) => (
          <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
        ))}
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>
      <QuickFilters label="Quick filters" groups={chips} clearHref={clearHref} />
    </div>
  )
}
