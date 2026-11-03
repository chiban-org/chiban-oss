'use client'

import type { ChangeEvent } from 'react'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { QUEUE_SEARCH_ID } from '@/components/queue/useQueueKeys'
import type { ChipGroupView } from '@/features/dataTable/quickFilters'
import { stateFilterOptions } from '@/features/queue/stateFilterOptions'

function submitOnChange(event: ChangeEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLInputElement && event.target.type === 'search') return
  event.currentTarget.requestSubmit()
}

interface Props {
  search: string
  state: string
  carried: [string, string][]
  chips: ChipGroupView[]
  clearHref: string | null
}

export function QueueFilters({ search, state, carried, chips, clearHref }: Props) {
  return (
    <div className="toolbar mb-5 flex flex-col gap-4">
      <form
        method="get"
        role="search"
        aria-label="Filter the work queue"
        onChange={submitOnChange}
        className="flex flex-wrap items-end gap-x-4 gap-y-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Search by number
          <input
            id={QUEUE_SEARCH_ID}
            type="search"
            name="q"
            defaultValue={search}
            className="h-10 w-44 rounded-md border bg-surface px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            name="state"
            defaultValue={state}
            className="h-10 rounded-md border bg-surface px-3"
          >
            {stateFilterOptions().map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {carried.map(([name, value]) => (
          <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
        ))}
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>
      <QuickFilters
        label="Quick filters"
        groups={chips}
        clearHref={clearHref}
        className="border-t border-hairline pt-4"
      />
    </div>
  )
}
