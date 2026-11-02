import Link from 'next/link'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'
import { PermitLookupForm } from '@/components/inspections/PermitLookupForm'
import { RequestForm } from '@/components/inspections/RequestForm'
import { ScheduleBoardClient } from '@/components/inspections/ScheduleBoardClient'
import { NoPermission } from '@/components/staff/NoPermission'
import { loadScheduleBoard } from '@/features/inspections/boardData'
import { requestableTypes } from '@/features/inspections/eligibility'
import {
  describeIntakeBlock,
  findIssuedApplicationByNumber,
  findReinspectionTarget,
} from '@/features/inspections/lookup'
import { describePhoneHours } from '@/features/inspections/phoneHours'
import { schedulingDates } from '@/features/inspections/slots'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { requireStaffContext, type StaffContext } from '@/server/requireStaff'
import { requestInspectionAction, scheduleInspectionAction } from './actions'

export const dynamic = 'force-dynamic'

const NOTHING_TO_REQUEST =
  'Every inspection on this permit is already requested, scheduled, or passed.'

async function offeredTypes(ctx: StaffContext, applicationId: string | null, reinspect: string) {
  if (applicationId === null) return { offered: [], reinspection: null }
  const reinspection = await findReinspectionTarget(
    ctx.db,
    ctx.actor,
    applicationId,
    reinspect,
    ctx.signal,
  )
  if (reinspection !== null) return { offered: [reinspection], reinspection }
  return { offered: await requestableTypes(ctx.db, applicationId, ctx.signal), reinspection }
}

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
  const target =
    number.trim() === ''
      ? null
      : await findIssuedApplicationByNumber(ctx.db, ctx.actor, number, ctx.signal)
  const blockedCopy = target === null ? null : await describeIntakeBlock(ctx.db, target, ctx.signal)
  const { offered, reinspection } = await offeredTypes(ctx, target?.id ?? null, reinspect)
  const dates = schedulingDates(board.settings, packHolidayCalendar(), board.today)
  const hasGraph = board.inspectors.some((i) => i.calendarKind === 'graph')
  return (
    <main className="space-y-6">
      <h1>Inspections</h1>
      {hasGraph ? <GraphStubNotice /> : null}
      <ScheduleBoardClient
        requests={[...board.requests, ...board.scheduledAhead]}
        days={board.days}
        scheduleAction={scheduleInspectionAction}
      />
      <section aria-label="Take a request" className="max-w-xl space-y-3">
        <h2>Take a request</h2>
        <PermitLookupForm number={number} />
        {number.trim() !== '' && target === null ? <p>No permit has that number.</p> : null}
        {blockedCopy === null ? null : <p>{blockedCopy}</p>}
        {target === null || blockedCopy !== null ? null : offered.length === 0 ? (
          <p>{NOTHING_TO_REQUEST}</p>
        ) : (
          <RequestForm
            submitLabel="Record request"
            applicationId={target.id}
            types={offered.map((t) => ({
              checklistVersionId: t.checklistVersionId,
              label: t.label,
            }))}
            {...(reinspection === null ? {} : { reinspectionOf: reinspection.inspectionId })}
            dates={dates}
            action={requestInspectionAction}
            channels={[
              { value: 'phone', label: 'Phone' },
              { value: 'counter', label: 'Counter' },
            ]}
            phoneHoursText={describePhoneHours(board.settings)}
            outsidePhoneHours={board.outsidePhoneHours}
          />
        )}
      </section>
      <p>
        <Link href="/staff/inspections/day" className="text-action underline">
          Open an inspector day list
        </Link>
      </p>
    </main>
  )
}
