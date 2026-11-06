import type { Metadata } from 'next'
import Link from 'next/link'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'
import { ScheduleBoardClient } from '@/components/inspections/ScheduleBoardClient'
import { PageHeader } from '@/components/layout/PageHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadScheduleBoard } from '@/features/inspections/boardData'
import { requireStaffContext } from '@/server/requireStaff'
import { scheduleInspectionAction } from './actions'
import { loadTakeRequest, TakeRequestSection } from './takeRequest'

export const metadata: Metadata = { title: 'Inspections' }

export const dynamic = 'force-dynamic'

const INSPECTIONS_LEAD =
  'Book requested inspections into open inspector times: choose a request, then a time. Requests are listed oldest first, then the inspections already booked.'

export default async function ScheduleBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string; reinspect?: string }>
}) {
  const { number, reinspect = '' } = await searchParams
  const ctx = await requireStaffContext()
  const loaded = await loadScheduleBoard(ctx.db, ctx.actor, ctx.signal)
  if (!loaded.ok) return <NoPermission title="Inspections" action="schedule inspections" />
  const board = loaded.value
  return (
    <main data-wide>
      <PageHeader
        title="Inspections"
        lead={INSPECTIONS_LEAD}
        actions={
          <p className="m-0">
            <Link href="/staff/inspections/day">Open an inspector day list</Link>
          </p>
        }
      />
      {board.inspectors.some((i) => i.calendarKind === 'graph') ? <GraphStubNotice /> : null}
      <ScheduleBoardClient
        requests={[...board.requests, ...board.scheduledAhead]}
        days={board.days}
        today={board.today}
        takeRequest={
          <TakeRequestSection data={await loadTakeRequest(ctx, number, reinspect)} board={board} />
        }
        scheduleAction={scheduleInspectionAction}
      />
    </main>
  )
}
