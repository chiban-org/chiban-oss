'use client'

import type { ChangeEvent } from 'react'
import { QUEUE_SEARCH_ID } from '@/components/queue/useQueueKeys'
import { type QueueSearchParams, queueToggles } from '@/features/queue/queueParams'
import { stateFilterOptions } from '@/features/queue/stateFilterOptions'

const TOGGLE_CHIP =
  'flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-control-border bg-surface px-3 text-sm font-medium has-checked:border-action has-checked:bg-action/10 has-checked:text-action has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring'

function submitOnChange(event: ChangeEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLInputElement && event.target.type === 'search') return
  event.currentTarget.requestSubmit()
}

export function QueueFilters({ params }: { params: QueueSearchParams }) {
  return (
    <form
      method="get"
      role="search"
      aria-label="Filter the work queue"
      onChange={submitOnChange}
      className="toolbar mb-5 flex flex-wrap items-end gap-x-4 gap-y-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Search by number
        <input
          id={QUEUE_SEARCH_ID}
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          className="h-10 w-44 rounded-md border bg-surface px-3"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          name="state"
          defaultValue={params.state ?? ''}
          className="h-10 rounded-md border bg-surface px-3"
        >
          {stateFilterOptions().map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Show only</legend>
        {queueToggles(params).map((toggle) => (
          <label key={toggle.name} className={TOGGLE_CHIP}>
            <input
              type="checkbox"
              name={toggle.name}
              value="1"
              defaultChecked={toggle.on}
              className="accent-action"
            />
            {toggle.label}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  )
}
