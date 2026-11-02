import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GraphStubNotice } from '@/components/inspections/GraphStubNotice'
import { RequestForm } from '@/components/inspections/RequestForm'
import { ScheduleBoardClient } from '@/components/inspections/ScheduleBoardClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadScheduleBoard } from '@/features/inspections/boardData'
import { inspectableTypes } from '@/features/inspections/eligibility'
import {
  describeIntakeBlock,
  findIssuedApplicationByNumber,
  findReinspectionTarget,
} from '@/features/inspections/lookup'
import { describePhoneHours } from '@/features/inspections/phoneHours'
import { schedulingDates } from '@/features/inspections/slots'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { requireStaffContext } from '@/server/requireStaff'
import { requestInspectionAction, scheduleInspectionAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function ScheduleBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string; reinspect?: string }>
}) {
  const { number = '', reinspect = '' } = await searchParams
  const ctx = await requireStaffContext()
  const loaded = await loadScheduleBoard(ctx.db, ctx.actor, ctx.signal)
  if (!loaded.ok) notFound()
  const board = loaded.value
  const target =
    number.trim() === ''
      ? null
      : await findIssuedApplicationByNumber(ctx.db, ctx.actor, number, ctx.signal)
  const blockedCopy = target === null ? null : await describeIntakeBlock(ctx.db, target, ctx.signal)
  const types = target === null ? [] : await inspectableTypes(ctx.db, target.id, ctx.signal)
  const reinspection =
    target === null
      ? null
      : await findReinspectionTarget(ctx.db, ctx.actor, target.id, reinspect, ctx.signal)
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
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="permit-number" className="text-base">
              Permit number
            </Label>
            <Input
              id="permit-number"
              name="number"
              defaultValue={number}
              className="min-h-11 text-base"
            />
          </div>
          <Button type="submit" variant="outline" className="min-h-11 text-base">
            Find permit
          </Button>
        </form>
        {number.trim() !== '' && target === null ? <p>No permit has that number.</p> : null}
        {blockedCopy === null ? null : <p>{blockedCopy}</p>}
        {target !== null && blockedCopy === null ? (
          <RequestForm
            submitLabel="Record request"
            applicationId={target.id}
            types={(reinspection === null ? types : [reinspection]).map((t) => ({
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
        ) : null}
      </section>
      <p>
        <Link href="/staff/inspections/day" className="text-action underline">
          Open an inspector day list
        </Link>
      </p>
    </main>
  )
}
