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
  'Book requested inspections into open inspector times: choose a waiting request, open a day in the week grid, pick a time, then confirm. Waiting requests are listed oldest first. Choose a booking in the grid to move it.'

function OwedLink({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground">No results owed</span>
  return (
    <Link href="/staff/inspections/owed">{`${count} ${count === 1 ? 'result' : 'results'} owed`}</Link>
  )
}

export default async function ScheduleBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string; reinspect?: string; request?: string }>
}) {
  const { number, reinspect = '', request = null } = await searchParams
  const ctx = await requireStaffContext()
  const loaded = await loadScheduleBoard(ctx.db, ctx.actor, ctx.signal, { pinnedId: request })
  if (!loaded.ok) return <NoPermission title="Inspections" action="schedule inspections" />
  const board = loaded.value
  return (
    <main data-wide>
      <PageHeader
        title="Inspections"
        lead={INSPECTIONS_LEAD}
        facts={[{ label: 'Results owed', value: <OwedLink count={board.owedCount} /> }]}
        actions={
          <p className="m-0">
            <Link href="/staff/inspections/day">Open an inspector day list</Link>
          </p>
        }
      />
      {board.inspectors.some((i) => i.calendarKind === 'graph') ? <GraphStubNotice /> : null}
      <ScheduleBoardClient
        requests={board.requests}
        bookings={board.bookings}
        days={board.days}
        inspectors={board.inspectors.map((i) => ({ userId: i.userId, name: i.name }))}
        today={board.today}
        takeRequest={
          <TakeRequestSection data={await loadTakeRequest(ctx, number, reinspect)} board={board} />
        }
        scheduleAction={scheduleInspectionAction}
        initialChosenId={request}
      />
    </main>
  )
}
