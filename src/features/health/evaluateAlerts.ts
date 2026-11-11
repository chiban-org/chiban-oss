import type { ALERT_KINDS } from '@/db/schema'
import type { DiskReading } from './disk'
import type { JobHealthRow } from './jobHealth'

export type AlertKind = (typeof ALERT_KINDS)[number]

export interface EvaluatedAlert {
  key: string
  kind: AlertKind
  severity: 'warning' | 'critical'
  summary: string
}

export interface EvaluateInput {
  disks: DiskReading[]
  jobs: JobHealthRow[]
  schedules: string[]
  scheduledJobNames: string[]
}

const DISK_WARNING_RATIO = 0.8
const DISK_CRITICAL_RATIO = 0.9
const PERCENT = 100

function diskAlert(disk: DiskReading): EvaluatedAlert | null {
  const percent = Math.round(disk.usedRatio * PERCENT)
  const key = `disk:${disk.path}`
  if (disk.usedRatio > DISK_CRITICAL_RATIO) {
    return {
      key,
      kind: 'disk_critical',
      severity: 'critical',
      summary: `Disk ${disk.path} is ${percent}% full`,
    }
  }
  if (disk.usedRatio > DISK_WARNING_RATIO) {
    return {
      key,
      kind: 'disk_warning',
      severity: 'warning',
      summary: `Disk ${disk.path} is ${percent}% full`,
    }
  }
  return null
}

export function evaluateAlerts(input: EvaluateInput): EvaluatedAlert[] {
  const alerts: EvaluatedAlert[] = []
  for (const disk of input.disks) {
    const alert = diskAlert(disk)
    if (alert !== null) alerts.push(alert)
  }
  for (const job of input.jobs) {
    if (!job.stale) continue
    alerts.push({
      key: `job_stale:${job.name}`,
      kind: 'job_stale',
      severity: 'critical',
      summary: `Job ${job.name} has not succeeded recently`,
    })
  }
  const scheduled = new Set(input.schedules)
  for (const name of input.scheduledJobNames) {
    if (scheduled.has(name)) continue
    alerts.push({
      key: `schedule_missing:${name}`,
      kind: 'schedule_missing',
      severity: 'critical',
      summary: `Job ${name} is not scheduled`,
    })
  }
  return alerts
}
