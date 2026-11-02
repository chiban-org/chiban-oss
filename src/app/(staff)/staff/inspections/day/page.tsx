import Link from 'next/link'
import { DayList } from '@/components/inspections/DayList'
import { NoPermission } from '@/components/staff/NoPermission'
import { listInspectors } from '@/features/inspections/availability'
import { getDayList } from '@/features/inspections/dayList'
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

function href(date: CivilDate, inspector: string): string {
  return `/staff/inspections/day?date=${date}&inspector=${inspector}`
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
  const inspectorUserId =
    params.inspector !== undefined && isUuid(params.inspector) ? params.inspector : ctx.actor.userId
  const list = await getDayList(ctx.db, ctx.actor, { inspectorUserId, date }, ctx.signal)
  if (!list.ok) return <NoPermission title="My day" action="see this inspector's day" />
  const inspectors = managesAllInspectors(ctx.actor) ? await listInspectors(ctx.db, ctx.signal) : []
  return (
    <main className="public-shell mx-auto max-w-xl space-y-4">
      {inspectors.length > 0 ? (
        <nav aria-label="Inspectors">
          <ul className="m-0 flex list-none flex-wrap gap-x-4 p-0">
            {inspectors.map((i) => (
              <li key={i.userId}>
                <Link
                  href={href(date, i.userId)}
                  className="inline-flex min-h-11 items-center text-action underline"
                >
                  {i.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <DayList
        date={date}
        stops={list.value}
        previousHref={href(addDays(date, -1), inspectorUserId)}
        nextHref={href(addDays(date, 1), inspectorUserId)}
      />
    </main>
  )
}
