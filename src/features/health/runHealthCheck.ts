import type { Db } from '@/db/client'
import { getTownSettings } from '@/features/town/settings'
import { type AlertEvent, markNotified, syncAlerts } from './alertState'
import type { AlertChannel, AlertMessage } from './channels/types'
import type { DiskReading } from './disk'
import { evaluateAlerts } from './evaluateAlerts'
import { jobHealth } from './jobHealth'
import type { ScheduledJob } from './scheduledJobs'

export interface HealthCheckInput {
  channels: AlertChannel[]
  jobs: ScheduledJob[]
  schedules: string[]
  disks: DiskReading[]
  heartbeatUrl: string | undefined
  fetch: typeof fetch
  now: Date
}

const FALLBACK_TOWN_NAME = 'Chiban'
const RESOLVED_PREFIX = 'Resolved: '

function toMessage(event: AlertEvent, townName: string): AlertMessage {
  return {
    key: event.key,
    kind: event.kind,
    severity: event.severity,
    state: event.state,
    summary: event.state === 'resolved' ? `${RESOLVED_PREFIX}${event.summary}` : event.summary,
    townName,
    ackUrl: null,
  }
}

async function deliver(
  channels: AlertChannel[],
  message: AlertMessage,
  signal: AbortSignal,
): Promise<boolean> {
  let reached = false
  for (const channel of channels) {
    const sent = await channel.send(message, signal)
    if (sent.ok) reached = true
  }
  return reached
}

async function pingHeartbeat(url: string, fetcher: typeof fetch, signal: AbortSignal) {
  try {
    await fetcher(url, { method: 'GET', signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    console.error('[health] heartbeat ping failed', e instanceof Error ? e.message : e)
  }
}

export async function runHealthCheck(
  db: Db,
  input: HealthCheckInput,
  signal: AbortSignal,
): Promise<{ firing: number }> {
  const jobs = await jobHealth(db, input.now, signal, input.jobs)
  const evaluated = evaluateAlerts({
    disks: input.disks,
    jobs,
    schedules: input.schedules,
    scheduledJobNames: input.jobs.filter((j) => j.intervalSeconds !== undefined).map((j) => j.name),
  })
  const events = await syncAlerts(db, evaluated, input.now, signal)
  const town = await getTownSettings(db, signal)
  const townName = town.ok ? town.value.name : FALLBACK_TOWN_NAME
  for (const event of events) {
    const reached = await deliver(input.channels, toMessage(event, townName), signal)
    if (reached && event.state === 'firing') await markNotified(db, event.key, input.now, signal)
  }
  if (input.heartbeatUrl !== undefined) await pingHeartbeat(input.heartbeatUrl, input.fetch, signal)
  return { firing: evaluated.length }
}
