import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { BackupScheduleRow } from '@/db/schema'
import type { ExportTargetView } from '@/features/export/targets/manageTargets'
import { saveBackupScheduleAction } from './actions'
import { hourLabel } from './backupCopy'
import { LAST_HOUR, MAX_KEEP } from './backupForm'

const FREQUENCY_OPTIONS = [
  ['daily', 'Every day'],
  ['weekly', 'Every week'],
] as const

const HOUR_OPTIONS = Array.from(
  { length: LAST_HOUR + 1 },
  (_, h) => [String(h), hourLabel(h)] as const,
)

const DEFAULT_KEEP = 14
const DEFAULT_HOUR = 1

export function ScheduleForm({
  schedule,
  targets,
}: {
  schedule: BackupScheduleRow | null
  targets: readonly ExportTargetView[]
}) {
  if (targets.length === 0) {
    return (
      <p>
        No storage is set up yet. Add a folder, bucket or drive under{' '}
        <Link href="/staff/admin/export/targets">Copy exports to your own storage</Link>, then come
        back to choose it here.
      </p>
    )
  }
  const targetOptions = [
    ['', 'Off: no scheduled backups'],
    ...targets.map((t) => [t.id, t.name] as const),
  ] as const
  return (
    <ActionForm action={saveBackupScheduleAction} submitLabel="Save schedule">
      <div className="max-w-md space-y-4">
        <SelectField
          id="backup-target"
          label="Where backups go"
          name="targetId"
          options={targetOptions}
          defaultValue={schedule?.targetId ?? ''}
        />
        <SelectField
          id="backup-frequency"
          label="How often"
          name="frequency"
          options={FREQUENCY_OPTIONS}
          defaultValue={schedule?.frequency ?? 'daily'}
        />
        <SelectField
          id="backup-hour"
          label="Start time"
          hint="In the town's time zone. A weekly backup runs on the day of the week of its first run."
          name="startHour"
          options={HOUR_OPTIONS}
          defaultValue={String(schedule?.startHour ?? DEFAULT_HOUR)}
        />
        <TextField
          id="backup-keep"
          label="Backups to keep"
          hint="Older backup files on that storage are deleted. Other files there are left alone."
          name="keepCount"
          type="number"
          min={1}
          max={MAX_KEEP}
          required
          defaultValue={String(schedule?.keepCount ?? DEFAULT_KEEP)}
        />
      </div>
    </ActionForm>
  )
}
