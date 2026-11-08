'use client'

import { Fragment, useState } from 'react'
import { matchesQuery } from '@/components/inspections/boardModel'
import { type BoardItem, isBooking } from '@/components/inspections/boardTypes'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCivilDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

const CHANNEL_LABEL = { phone: 'Phone', counter: 'Counter', portal: 'Portal' } as const
const FILTER_AFTER = 8

function chipFacts(item: BoardItem, owed: boolean): { text: string; strong: boolean }[] {
  const facts: { text: string; strong: boolean }[] = [
    { text: CHANNEL_LABEL[item.channel], strong: false },
  ]
  if (item.preferredDate !== null) {
    facts.push({ text: `Prefers ${formatCivilDate(item.preferredDate)}`, strong: false })
  }
  if (item.isReinspection) facts.push({ text: 'Reinspection', strong: true })
  if (owed) facts.push({ text: 'Result owed', strong: true })
  return facts
}

function Chip({
  item,
  chosen,
  owed,
  onChoose,
}: {
  item: BoardItem
  chosen: boolean
  owed: boolean
  onChoose: (item: BoardItem) => void
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-pressed={chosen}
        onClick={() => onChoose(item)}
        className={cn(
          'block w-72 max-w-full cursor-pointer rounded-md border bg-surface px-3 py-2 text-left font-[inherit] text-ink hover:bg-canvas',
          chosen ? 'border-action bg-action/10 hover:bg-action/10' : 'border-hairline',
        )}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">
            <span className="sr-only">Choose</span> {`${item.applicationNumber}, ${item.typeLabel}`}
          </span>
          {chosen ? (
            <>
              {' '}
              <span className="shrink-0 font-semibold text-action">Chosen</span>
            </>
          ) : null}
        </span>{' '}
        <span className="block truncate">{item.address}</span>{' '}
        <span className="flex flex-wrap gap-x-2 text-muted-foreground">
          {chipFacts(item, owed).map((fact) => (
            <Fragment key={fact.text}>
              <span className={fact.strong ? 'font-semibold text-ink' : undefined}>
                {fact.text}
              </span>{' '}
            </Fragment>
          ))}
        </span>
      </button>
    </li>
  )
}

function emptyCopy(total: number, query: string): string {
  return total > 0 && query !== '' ? `No request matches ${query}.` : 'No requests are waiting.'
}

export function WaitingRow({
  items,
  today,
  chosenId,
  onChoose,
}: {
  items: BoardItem[]
  today: string
  chosenId: string | null
  onChoose: (item: BoardItem) => void
}) {
  const [query, setQuery] = useState('')
  const visible = items.filter((item) => matchesQuery(item, query))
  return (
    <section aria-label="Waiting" className="m-0 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0">{`Waiting (${items.length})`}</h2>
        {items.length > FILTER_AFTER ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="request-search">Search requests</Label>
            <Input
              id="request-search"
              type="search"
              placeholder="Permit number, address or contact"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72 max-w-full"
            />
          </div>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground">{emptyCopy(items.length, query)}</p>
      ) : (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {visible.map((item) => (
            <Chip
              key={item.inspectionId}
              item={item}
              chosen={item.inspectionId === chosenId}
              owed={isBooking(item) && item.date < today}
              onChoose={onChoose}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
