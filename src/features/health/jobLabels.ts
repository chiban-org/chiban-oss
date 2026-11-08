import { words } from '@/lib/words'

const JOB_LABELS = new Map<string, string>([
  ['system.heartbeat', 'System heartbeat'],
  ['gis.refreshLayer', 'Parcel layer refresh'],
  ['gis.scheduleRefreshes', 'Parcel layer refresh scheduling'],
  ['parcels.expireAliasOverrides', 'Parcel ID override expiry'],
  ['clocks.daily', 'Daily clock check'],
  ['appeals.daily', 'Daily appeal period check'],
  ['payments.reconcile', 'Payment reconciliation'],
  ['records.preserve', 'Records preservation'],
  ['notifications.send', 'Notification sending'],
  ['calendar.push', 'Calendar updates'],
  ['exports.build', 'Export build'],
  ['exports.incremental', 'Incremental export'],
  ['exports.pickup', 'Export pickup'],
  ['exports.prune', 'Export cleanup'],
  ['health.check', 'Health check'],
  ['jobs.sweep', 'Stuck job sweep'],
  ['reports.scheduled', 'Scheduled reports'],
])

export function jobLabel(name: string): string {
  return JOB_LABELS.get(name) ?? words(name.replaceAll('.', ' '))
}
