import { ChevronLeft, ChevronRight, MapPin, Phone } from 'lucide-react'
import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { Card, CardContent } from '@/components/ui/card'
import type { Status } from '@/features/design/tokens'
import type { DayListRow } from '@/features/inspections/dayList'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'

const STATUS: Record<DayListRow['status'], { chip: Status; label: string }> = {
  scheduled: { chip: 'neutral', label: 'Scheduled' },
  passed: { chip: 'passed', label: 'Passed' },
  failed: { chip: 'failed', label: 'Failed' },
}

const LINK = 'inline-flex min-h-11 items-center gap-2 text-action underline'

function addressText(stop: DayListRow): string | null {
  const address = stop.siteAddress
  if (address.state === 'known' || address.state === 'stale') return address.value
  return address.state === 'import_failed' ? address.value : null
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

function Stop({ stop }: { stop: DayListRow }) {
  const address = addressText(stop)
  const status = STATUS[stop.status]
  return (
    <li className="list-none">
      <Card className="gap-2 py-4">
        <CardContent className="space-y-2 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-lg font-semibold">{minutesToClock(stop.startMinute)}</p>
            <StatusChip status={status.chip} label={status.label} />
          </div>
          <p className="m-0 font-medium">
            {stop.typeLabel}
            {stop.isReinspection ? <span className="ml-2 font-semibold">Reinspection</span> : null}
          </p>
          {address === null ? (
            <p className="m-0">Address not on file</p>
          ) : (
            <a
              className={LINK}
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
              rel="noreferrer"
            >
              <MapPin className="size-5" aria-hidden={true} />
              {address}
            </a>
          )}
          <p className="m-0">{`${stop.contactName}`}</p>
          {stop.contactPhone === null ? null : (
            <a className={LINK} href={telHref(stop.contactPhone)}>
              <Phone className="size-5" aria-hidden={true} />
              {stop.contactPhone}
            </a>
          )}
          {stop.accessNotes === null ? null : (
            <p className="m-0">{`Access: ${stop.accessNotes}`}</p>
          )}
          {stop.previousFailureNotes === null ? null : (
            <p className="m-0 rounded-md bg-highlight px-3 py-2">{`Last time: ${stop.previousFailureNotes}`}</p>
          )}
          <Link
            href={`/staff/inspections/${stop.inspectionId}`}
            className="inline-flex min-h-11 items-center font-semibold text-action underline"
          >
            {`Open ${stop.applicationNumber}`}
          </Link>
        </CardContent>
      </Card>
    </li>
  )
}

export function DayList({
  date,
  stops,
  previousHref,
  nextHref,
}: {
  date: string
  stops: DayListRow[]
  previousHref: string
  nextHref: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={previousHref} aria-label="Previous day" className={LINK}>
          <ChevronLeft className="size-6" aria-hidden={true} />
        </Link>
        <h1 className="m-0 text-center text-2xl">{formatCivilDate(date)}</h1>
        <Link href={nextHref} aria-label="Next day" className={LINK}>
          <ChevronRight className="size-6" aria-hidden={true} />
        </Link>
      </div>
      {stops.length === 0 ? (
        <p>No inspections on this day.</p>
      ) : (
        <ul className="m-0 space-y-3 p-0">
          {stops.map((stop) => (
            <Stop key={stop.inspectionId} stop={stop} />
          ))}
        </ul>
      )}
    </div>
  )
}
