import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { alertTests, healthAlerts, jobRuns } from '@/db/schema'
import { createEmailChannel } from '@/features/health/channels/emailChannel'
import { runHealthCheck } from '@/features/health/runHealthCheck'
import { allScheduledJobs } from '@/features/health/scheduledJobs'
import { acknowledgeAlert, sendSyntheticAlert } from '@/features/health/syntheticAlert'
import type { MemoryMailTransport } from '@/features/mail/memoryTransport'

const ALERT_EMAIL_RECIPIENT = 'ops@alderpond.example'
const STALE_INTERVALS = 3
const MS_PER_SECOND = 1000
const ACK_TOKEN_PATTERN = /\/alerts\/ack\/([A-Za-z0-9_-]{43})/

export async function seedStaleJobAlert(db: Db, now: Date, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db.select({ key: healthAlerts.key }).from(healthAlerts)
  if (existing.length > 0) return false
  const job = (await allScheduledJobs()).find((j) => j.intervalSeconds !== undefined)
  if (job?.intervalSeconds === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'No interval job to make stale')
  }
  const staleSince = new Date(now.getTime() - job.intervalSeconds * STALE_INTERVALS * MS_PER_SECOND)
  await db
    .insert(jobRuns)
    .values({ jobName: job.name, lastSuccessAt: staleSince })
    .onConflictDoNothing()
  await runHealthCheck(
    db,
    {
      channels: [],
      jobs: [job],
      schedules: [job.name],
      disks: [],
      heartbeatUrl: undefined,
      fetch,
      now,
    },
    signal,
  )
  return true
}

export async function seedAcknowledgedEmailTest(
  db: Db,
  mail: MemoryMailTransport,
  now: Date,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db.select({ id: alertTests.id }).from(alertTests)
  if (existing.length > 0) return false
  const channel = createEmailChannel(mail, [ALERT_EMAIL_RECIPIENT])
  await sendSyntheticAlert(db, [channel], signal, { now, createdByKind: 'seed' })
  const token = ACK_TOKEN_PATTERN.exec(mail.sent.at(-1)?.text ?? '')?.[1]
  if (token === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'Test alert had no ack link')
  await acknowledgeAlert(db, token, now, signal)
  return true
}
