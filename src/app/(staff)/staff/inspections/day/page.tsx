import Link from 'next/link'
import { DayList } from '@/components/inspections/DayList'
import { InspectorPicker } from '@/components/inspections/InspectorPicker'
import { MissingResults } from '@/components/inspections/MissingResults'
import { NoPermission } from '@/components/staff/NoPermission'
import type { Actor } from '@/features/auth/actor'
import { listInspectors } from '@/features/inspections/availability'
import { getDayList, nextDayWithInspections } from '@/features/inspections/dayList'
import { listMissingResults } from '@/features/inspections/inspectorWork'
import { managesAllInspectors } from '@/features/inspections/visibility'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { addDays, type CivilDate, parseCivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

export const dynamic = 'force-dynamic'

interface SearchParams {
  date?: string
  inspector?: string
}

type Inspector = { userId: string; name: string }

const MISSING_LIMIT = 20

function href(date: CivilDate, inspector: string): string {
  return `/staff/inspections/day?date=${date}&inspector=${inspector}`
}

function chosenInspector(actor: Actor, requested: string | undefined): string | null {
  if (requested !== undefined && isUuid(requested)) return requested
  if (actor.roles.includes('inspector')) return actor.userId
  return managesAllInspectors(actor) ? null : actor.userId
}

function whoseDay(actor: Actor, inspectorUserId: string, inspectors: readonly Inspector[]) {
  if (inspectorUserId === actor.userId) return 'Your day'
  return inspectors.find((i) => i.userId === inspectorUserId)?.name ?? null
}

function InspectorLinks({
  inspectors,
  date,
  selected,
}: {
  inspectors: readonly Inspector[]
  date: CivilDate
  selected: string
}) {
  if (inspectors.length < 2) return null
  return (
    <nav aria-label="Inspectors">
      <ul className="m-0 flex list-none flex-wrap gap-x-4 p-0">
        {inspectors.map((i) => (
          <li key={i.userId}>
            <Link
              href={href(date, i.userId)}
              aria-current={i.userId === selected ? 'page' : undefined}
              className="inline-flex min-h-11 items-center aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:no-underline"
            >
              {i.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default async function InspectorDayPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const parsed = parseCivilDate(params.date ?? '')
  const date = parsed.ok ? parsed.value : today
  const inspectors = managesAllInspectors(ctx.actor) ? await listInspectors(ctx.db, ctx.signal) : []
  const inspectorUserId = chosenInspector(ctx.actor, params.inspector)
  if (inspectorUserId === null) {
    return <InspectorPicker inspectors={inspectors} href={(id) => href(date, id)} />
  }
  const list = await getDayList(ctx.db, ctx.actor, { inspectorUserId, date }, ctx.signal)
  if (!list.ok) return <NoPermission title="My day" action="see this inspector's day" />
  const missing = await listMissingResults(
    ctx.db,
    ctx.actor,
    { inspectorUserId, today, limit: MISSING_LIMIT },
    ctx.signal,
  )
  const nextBusy =
    list.value.length === 0
      ? await nextDayWithInspections(ctx.db, ctx.actor, { inspectorUserId, date }, ctx.signal)
      : null
  return (
    <main className="public-shell mx-auto max-w-xl space-y-4">
      <InspectorLinks inspectors={inspectors} date={date} selected={inspectorUserId} />
      {missing.ok ? <MissingResults rows={missing.value.rows} total={missing.value.total} /> : null}
      <DayList
        date={date}
        stops={list.value}
        previousHref={href(addDays(date, -1), inspectorUserId)}
        nextHref={href(addDays(date, 1), inspectorUserId)}
        whose={whoseDay(ctx.actor, inspectorUserId, inspectors)}
        nextBusy={
          nextBusy === null ? null : { date: nextBusy, href: href(nextBusy, inspectorUserId) }
        }
      />
    </main>
  )
}
