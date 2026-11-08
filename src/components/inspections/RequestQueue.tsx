'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { BoardRequest } from '@/components/inspections/ScheduleBoard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCivilDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

const CHANNEL_LABEL = { phone: 'Phone', counter: 'Counter', portal: 'Portal' } as const

function matches(request: BoardRequest, query: string): boolean {
  if (query === '') return true
  const haystack =
    `${request.applicationNumber} ${request.typeLabel} ${request.address} ${request.contactName}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function RequestRow({
  request,
  chosen,
  onChoose,
}: {
  request: BoardRequest
  chosen: boolean
  onChoose: (request: BoardRequest) => void
}) {
  return (
    <li
      onClick={() => onChoose(request)}
      className={cn(
        'relative cursor-pointer space-y-0.5 rounded-md border px-3 py-3 hover:bg-canvas',
        chosen ? 'border-action bg-canvas' : 'border-transparent',
      )}
    >
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
        <Link
          href={`/staff/inspections/${request.inspectionId}`}
          onClick={(e) => e.stopPropagation()}
        >
          {`${request.applicationNumber}, ${request.typeLabel}`}
        </Link>
        {chosen ? <span className="text-action">Chosen</span> : null}
      </p>
      <button
        type="button"
        aria-pressed={chosen}
        onClick={(e) => {
          e.stopPropagation()
          onChoose(request)
        }}
        className="m-0 block w-full cursor-pointer space-y-0.5 border-0 bg-transparent p-0 text-left font-[inherit] text-[length:inherit] text-ink"
      >
        <span className="sr-only">{`Choose ${request.applicationNumber}, ${request.typeLabel}: `}</span>
        <span className="block">{request.address}</span>
        <span className="flex flex-wrap gap-x-3 text-muted-foreground">
          <span>{CHANNEL_LABEL[request.channel]}</span>
          {request.isReinspection ? (
            <span className="font-semibold text-ink">Reinspection</span>
          ) : null}
          {request.preferredDate === null ? null : (
            <span>{`Prefers ${formatCivilDate(request.preferredDate)}`}</span>
          )}
        </span>
        {request.scheduledFor === undefined ? null : (
          <span className="block font-semibold">{`Booked ${request.scheduledFor}`}</span>
        )}
      </button>
    </li>
  )
}

function emptyCopy(requests: BoardRequest[], query: string): string {
  return requests.length > 0 && query !== ''
    ? `No request matches ${query}.`
    : 'No requests are waiting.'
}

export function RequestQueue({
  requests,
  chosenId,
  onChoose,
}: {
  requests: BoardRequest[]
  chosenId: string | null
  onChoose: (request: BoardRequest) => void
}) {
  const [query, setQuery] = useState('')
  const visible = requests.filter((r) => matches(r, query))
  return (
    <section aria-label="Requests and bookings" className="m-0">
      <h2>Requests and bookings</h2>
      <div className="space-y-1.5">
        <Label htmlFor="request-search">Search requests</Label>
        <Input
          id="request-search"
          type="search"
          placeholder="Permit number, address or contact"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {visible.length === 0 ? (
        <p>{emptyCopy(requests, query)}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {visible.map((request) => (
            <RequestRow
              key={request.inspectionId}
              request={request}
              chosen={request.inspectionId === chosenId}
              onChoose={onChoose}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
