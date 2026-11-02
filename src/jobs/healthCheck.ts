import { env } from '@/config/env'
import { JOB_NAMES } from '@/constants/jobNames'
import { configuredChannels } from '@/features/health/channels/configured'
import type { AlertChannel } from '@/features/health/channels/types'
import { type DiskReading, diskUsage } from '@/features/health/disk'
import { runHealthCheck } from '@/features/health/runHealthCheck'
import { allScheduledJobs, type ScheduledJob } from '@/features/health/scheduledJobs'
import { ok } from '@/types/result'
import { getBoss } from './boss'
import { defineJob } from './defineJob'

const INTERVAL_SECONDS = 300
const MINUTE_CHARS = 16

export interface HealthCheckJobDeps {
  channels(): AlertChannel[]
  listSchedules(signal: AbortSignal): Promise<string[]>
  diskUsage(paths: string[], signal: AbortSignal): Promise<DiskReading[]>
  diskPaths(): string[]
  heartbeatUrl(): string | undefined
  fetch: typeof fetch
  now(): Date
  jobs?: ScheduledJob[]
}

interface HealthPayload {
  at?: string
}

export function makeHealthCheckJob(deps: HealthCheckJobDeps) {
  return defineJob<HealthPayload>({
    name: JOB_NAMES.HEALTH_CHECK,
    intervalSeconds: INTERVAL_SECONDS,
    dedupKey: (p) =>
      `${JOB_NAMES.HEALTH_CHECK}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
    handler: async (_payload, ctx) => {
      await runHealthCheck(
        ctx.root,
        {
          channels: deps.channels(),
          jobs: deps.jobs ?? (await allScheduledJobs()),
          schedules: await deps.listSchedules(ctx.signal),
          disks: await deps.diskUsage(deps.diskPaths(), ctx.signal),
          heartbeatUrl: deps.heartbeatUrl(),
          fetch: deps.fetch,
          now: deps.now(),
        },
        ctx.signal,
      )
      return ok(undefined)
    },
  })
}

async function listBossSchedules(): Promise<string[]> {
  const boss = getBoss()
  if (boss === null) return []
  return (await boss.getSchedules()).map((s) => s.name)
}

export const healthCheckJob = makeHealthCheckJob({
  channels: () => configuredChannels(),
  listSchedules: listBossSchedules,
  diskUsage,
  diskPaths: () => env.HEALTH_DISK_PATHS,
  heartbeatUrl: () => env.HEALTH_HEARTBEAT_URL,
  fetch,
  now: () => new Date(),
})
