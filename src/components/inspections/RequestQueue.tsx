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

function RequestDetails({ request, chosen }: { request: BoardRequest; chosen: boolean }) {
  return (
    <>
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
        <Link href={`/staff/inspections/${request.inspectionId}`}>
          {`${request.applicationNumber}, ${request.typeLabel}`}
        </Link>
        {chosen ? <span className="text-action">Chosen</span> : null}
      </p>
      <p className="m-0">{request.address}</p>
      <p className="m-0 flex flex-wrap gap-x-3 text-muted-foreground">
        <span>{CHANNEL_LABEL[request.channel]}</span>
        {request.isReinspection ? (
          <span className="font-semibold text-ink">Reinspection</span>
        ) : null}
        {request.preferredDate === null ? null : (
          <span>{`Prefers ${formatCivilDate(request.preferredDate)}`}</span>
        )}
      </p>
      {request.scheduledFor === undefined ? null : (
        <p className="m-0 font-semibold">{`Booked ${request.scheduledFor}`}</p>
      )}
    </>
  )
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
        <p className="m-0">No requests are waiting.</p>
      ) : (
        <ul
          role="listbox"
          aria-label="Requests"
          className="m-0 flex list-none flex-col divide-y divide-hairline p-0"
        >
          {visible.map((request) => {
            const chosen = request.inspectionId === chosenId
            return (
              <li
                key={request.inspectionId}
                role="option"
                aria-selected={chosen}
                tabIndex={0}
                onClick={() => onChoose(request)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onChoose(request)
                }}
                className={cn(
                  '-mx-3 cursor-pointer space-y-0.5 rounded-md border-l-4 px-3 py-3 hover:bg-canvas',
                  chosen ? 'border-l-action bg-canvas' : 'border-l-transparent',
                )}
              >
                <RequestDetails request={request} chosen={chosen} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
