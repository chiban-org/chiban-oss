import Link from 'next/link'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'
import { ScheduleBoardClient } from '@/components/inspections/ScheduleBoardClient'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadScheduleBoard } from '@/features/inspections/boardData'
import { requireStaffContext } from '@/server/requireStaff'
import { scheduleInspectionAction } from './actions'
import { loadTakeRequest, TakeRequestSection } from './takeRequest'

export const dynamic = 'force-dynamic'

export default async function ScheduleBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string; reinspect?: string }>
}) {
  const { number = '', reinspect = '' } = await searchParams
  const ctx = await requireStaffContext()
  const loaded = await loadScheduleBoard(ctx.db, ctx.actor, ctx.signal)
  if (!loaded.ok) return <NoPermission title="Inspections" action="schedule inspections" />
  const board = loaded.value
  const asked = number.trim() !== ''
  const takeRequest = (
    <TakeRequestSection data={await loadTakeRequest(ctx, number, reinspect)} board={board} />
  )
  return (
    <main className="space-y-6">
      <h1>Inspections</h1>
      {board.inspectors.some((i) => i.calendarKind === 'graph') ? <GraphStubNotice /> : null}
      {asked ? takeRequest : null}
      <ScheduleBoardClient
        requests={[...board.requests, ...board.scheduledAhead]}
        days={board.days}
        scheduleAction={scheduleInspectionAction}
      />
      {asked ? null : takeRequest}
      <p>
        <Link href="/staff/inspections/day" className="text-action underline">
          Open an inspector day list
        </Link>
      </p>
    </main>
  )
}
