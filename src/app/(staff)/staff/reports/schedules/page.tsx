import type { Metadata } from 'next'
import Link from 'next/link'
import { ListHeader } from '@/components/layout/ListHeader'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { EXPORT_REPORTS, reportTitle } from '@/features/reports/reportExport'
import {
  canUseReport,
  capabilitiesFor,
  recipientChoices,
  type ScheduledReport,
} from '@/features/reports/scheduleAccess'
import { frequencyLabel, SCHEDULE_FREQUENCIES } from '@/features/reports/schedulePeriod'
import { listSchedules, type ScheduleView } from '@/features/reports/scheduleQueries'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate, formatInstantOrNever } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { AddSchedule, EditSchedule, type ScheduleOptions } from './ScheduleForms'
import { DeleteSchedule, PauseSchedule } from './ScheduleRowActions'

export const metadata: Metadata = { title: 'Scheduled reports' }

export const dynamic = 'force-dynamic'

const FREQUENCY_WORDS = new Map([
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
])

const titleOf = (s: ScheduleView) => `${reportTitle(s.report)}, ${s.frequency}`

function lastSent(s: ScheduleView, timeZone: string): string {
  if (s.lastSentAt === null) return 'Not sent yet'
  const sentOn = formatInstantOrNever(s.lastSentAt, timeZone)
  return s.lastPeriodFrom === null
    ? sentOn
    : `${sentOn}, for ${formatCivilDate(s.lastPeriodFrom)} to ${formatCivilDate(s.lastPeriodTo ?? s.lastPeriodFrom)}`
}

function ScheduleRow({
  s,
  options,
  timeZone,
}: {
  s: ScheduleView
  options: ScheduleOptions
  timeZone: string
}) {
  const title = titleOf(s)
  return (
    <tr>
      <td>{reportTitle(s.report)}</td>
      <td className="whitespace-nowrap">{FREQUENCY_WORDS.get(s.frequency) ?? s.frequency}</td>
      <td>{s.recipients.map((r) => r.name).join(', ')}</td>
      <td className="whitespace-nowrap">
        {s.paused ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          formatCivilDate(s.nextRunOn)
        )}
      </td>
      <td>{lastSent(s, timeZone)}</td>
      <td className="whitespace-nowrap">
        <StatusChip
          status={s.paused ? 'neutral' : 'passed'}
          label={s.paused ? 'Paused' : 'Active'}
        />
      </td>
      <td>
        <div className="flex flex-nowrap gap-2">
          <EditSchedule
            scheduleId={s.id}
            title={title}
            options={options}
            initial={{
              report: s.report,
              frequency: s.frequency,
              recipientIds: s.recipients.map((r) => r.id),
            }}
          />
          <PauseSchedule scheduleId={s.id} title={title} paused={s.paused} />
          <DeleteSchedule scheduleId={s.id} title={title} />
        </div>
      </td>
    </tr>
  )
}

export default async function SchedulesPage() {
  const ctx = await requireStaffContext()
  const listed = await listSchedules(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) return <NoPermission title="Scheduled reports" action="schedule reports" />
  const usable: ScheduledReport[] = []
  for (const report of EXPORT_REPORTS) {
    if (await canUseReport(ctx.db, ctx.actor.userId, report, ctx.signal)) usable.push(report)
  }
  const options: ScheduleOptions = {
    reports: EXPORT_REPORTS.filter((r) => usable.includes(r)).map((r) => ({
      value: r,
      label: reportTitle(r),
      needs: [...capabilitiesFor(r)],
    })),
    frequencies: SCHEDULE_FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(f) })),
    people: await recipientChoices(ctx.db),
  }
  const town = await getTownSettings(ctx.db, ctx.signal)
  const timeZone = town.ok ? town.value.timeZone : 'America/New_York'
  return (
    <main data-wide="">
      <p className="m-0 text-sm">
        <Link href="/staff/reports">Reports</Link>
      </p>
      <ListHeader
        title="Scheduled reports"
        lead="Reports Chiban emails on its own, by report. Each run covers the calendar week, month or quarter before the run day."
        actions={<AddSchedule options={options} />}
      />
      {listed.value.length === 0 ? (
        <p>
          No reports are scheduled yet. Schedule one to have it emailed every week, month or
          quarter.
        </p>
      ) : (
        <div className="table-panel">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr>
                <th scope="col">Report</th>
                <th scope="col">How often</th>
                <th scope="col">Sends to</th>
                <th scope="col">Next run</th>
                <th scope="col">Last sent</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listed.value.map((s) => (
                <ScheduleRow key={s.id} s={s} options={options} timeZone={timeZone} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
