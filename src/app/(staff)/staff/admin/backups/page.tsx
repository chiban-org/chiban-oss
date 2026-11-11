import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import type { BackupScheduleRow } from '@/db/schema'
import { nextBackupAt } from '@/features/backup/schedule/backupDue'
import { readBackupSchedule, townZone } from '@/features/backup/schedule/scheduleStore'
import { listTargets } from '@/features/export/targets/manageTargets'
import { formatInstantLong } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { backUpNowAction } from './actions'
import { FREQUENCY_COPY, hourLabel, PROBLEM_COPY, sizeLabel } from './backupCopy'
import { ScheduleForm } from './ScheduleForm'

export const metadata: Metadata = { title: 'Backups' }

export const dynamic = 'force-dynamic'

type Day = (instant: Date) => string

function nextCopy(schedule: BackupScheduleRow, now: Date, day: Day): string {
  if (schedule.runRequestedAt !== null) {
    return 'A backup was asked for. It starts within a minute or two.'
  }
  const next = nextBackupAt(schedule, now)
  if (next === null) return 'No backup is scheduled.'
  if (next.getTime() <= now.getTime()) return 'A backup is due now. It starts within the hour.'
  return `Next backup: ${day(next)}.`
}

function LastSuccess({ schedule, day }: { schedule: BackupScheduleRow; day: Day }) {
  if (schedule.lastSuccessAt === null) return <p>No backup has been made yet.</p>
  const file = schedule.lastSuccessPath ?? 'unknown'
  const size = schedule.lastSuccessBytes === null ? '' : `, ${sizeLabel(schedule.lastSuccessBytes)}`
  return <p>{`Last backup: ${day(schedule.lastSuccessAt)}. File ${file}${size}.`}</p>
}

function LastProblem({ schedule, day }: { schedule: BackupScheduleRow; day: Day }) {
  if (schedule.lastFailureAt === null) return null
  const current =
    schedule.lastSuccessAt === null ||
    schedule.lastFailureAt.getTime() > schedule.lastSuccessAt.getTime()
  const lead = PROBLEM_COPY[schedule.lastFailureKind ?? 'failed']
  const reason = schedule.lastError ?? 'no reason was recorded.'
  return (
    <p {...(current ? { role: 'alert' } : {})}>
      {`${lead} ${day(schedule.lastFailureAt)}: ${reason}`}
    </p>
  )
}

function Status({
  schedule,
  targetName,
  now,
  day,
}: {
  schedule: BackupScheduleRow | null
  targetName: string | null
  now: Date
  day: Day
}) {
  if (schedule?.targetId == null || targetName === null) {
    return <p>Scheduled backups are off. Choose where backups go below to turn them on.</p>
  }
  const when = `${FREQUENCY_COPY[schedule.frequency]} at ${hourLabel(schedule.startHour)}`
  return (
    <>
      <p>{`Backups go to ${targetName}, ${when}.`}</p>
      <LastSuccess schedule={schedule} day={day} />
      <LastProblem schedule={schedule} day={day} />
      {schedule.lastPruneError === null ? null : (
        <p role="alert">{`Old backups could not be removed: ${schedule.lastPruneError}`}</p>
      )}
      <p>{nextCopy(schedule, now, day)}</p>
      <ActionForm action={backUpNowAction} submitLabel="Back up now">
        <input type="hidden" name="now" value="1" />
      </ActionForm>
    </>
  )
}

export default async function BackupsPage() {
  const ctx = await requireStaffContext()
  const listed = await listTargets(ctx.db, ctx.actor, ctx.signal)
  if (!listed.ok) return <NoPermission title="Backups" action="change backups" />
  const [schedule, zone] = await Promise.all([
    readBackupSchedule(ctx.db, ctx.signal),
    townZone(ctx.db, ctx.signal),
  ])
  const day = (instant: Date) => formatInstantLong(instant, zone)
  const target = listed.value.find((t) => t.id === schedule?.targetId)
  return (
    <main>
      <SettingsHeader
        title="Backups"
        lead="Chiban copies the whole database and every stored file into one encrypted backup, sends it to storage the town controls, and keeps the newest ones."
      />
      <section aria-labelledby="backup-status">
        <h2 id="backup-status">Latest backup</h2>
        <Status schedule={schedule} targetName={target?.name ?? null} now={new Date()} day={day} />
      </section>
      <section aria-labelledby="backup-schedule">
        <h2 id="backup-schedule">Schedule</h2>
        <ScheduleForm schedule={schedule} targets={listed.value} />
        <p>
          Backups are encrypted with the passphrase set on the server. Nobody can open one without
          it. A second backup on the same day replaces that day&apos;s file.
        </p>
        <p>
          When a backup is overdue or fails, an alert goes out through the channels on the{' '}
          <Link href="/staff/admin/health">Health</Link> page.
        </p>
      </section>
    </main>
  )
}
