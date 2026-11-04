import { eq } from 'drizzle-orm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { healthAlerts, workerState } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { configuredChannelKinds } from '@/features/health/channels/configured'
import { PAGER_STUB_NOTICE } from '@/features/health/channels/pagerChannel'
import { jobHealth } from '@/features/health/jobHealth'
import { alertReadiness, type ReadinessStatus } from '@/features/health/syntheticAlert'
import { getTownSettings } from '@/features/town/settings'
import { DEFAULT_TIME_ZONE } from '@/features/town/timeZone'
import { formatInstantOrNever } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { JobList } from './JobList'

export const dynamic = 'force-dynamic'

const READINESS_COPY: Record<ReadinessStatus, string> = {
  acknowledged: 'Acknowledged within the last 30 days',
  sent_unacknowledged: 'Test sent, not acknowledged',
  never_tested: 'Never tested',
}

const NO_WORKER_COPY =
  'No background worker has started for this town. Until one runs, no job on this page runs: emails stay queued and exports stay waiting to start.'

const NO_CHANNEL_COPY =
  'No alert channel is configured, so nobody is told when a job fails. Set ALERT_EMAIL_TO on the server to send alerts by email, or PAGER_ROUTING_KEY to send them to a pager.'

const CHANNEL_COPY = { email: 'Email', pager: 'Pager' } as const

export default async function HealthPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return <NoPermission title="Health" action="see system health" />
  }
  const now = new Date()
  const kinds = configuredChannelKinds()
  const [jobs, firing, readiness, town, [worker]] = await Promise.all([
    jobHealth(ctx.db, now, ctx.signal),
    ctx.db.select().from(healthAlerts).where(eq(healthAlerts.state, 'firing')),
    alertReadiness(ctx.db, kinds, now, ctx.signal),
    getTownSettings(ctx.db, ctx.signal),
    ctx.db.select().from(workerState).limit(1),
  ])
  const zone = town.ok ? town.value.timeZone : DEFAULT_TIME_ZONE
  const day = (instant: Date | null) => formatInstantOrNever(instant, zone)
  return (
    <main>
      <SettingsHeader
        title="Health"
        lead="Whether background jobs are running, and whether anyone is told when one fails."
      />
      <section aria-labelledby="alerts-heading">
        <h2 id="alerts-heading">Firing alerts</h2>
        {firing.length === 0 ? <p>No alerts are firing.</p> : null}
        <ul className="m-0 list-none space-y-2 p-0">
          {firing.map((alert) => (
            <li key={alert.key} className="rounded-md border p-3">
              <p className="m-0 font-medium">{alert.summary}</p>
              <p className="m-0">Since {day(alert.firstSeenAt)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading">Background jobs</h2>
        {worker === undefined ? (
          <p role="alert">{NO_WORKER_COPY}</p>
        ) : (
          <p>The background worker last started {day(worker.startedAt)}.</p>
        )}
        <JobList jobs={jobs} day={day} />
      </section>
      <section aria-labelledby="channels-heading">
        <h2 id="channels-heading">Alert channels</h2>
        {readiness.length === 0 ? <p>{NO_CHANNEL_COPY}</p> : null}
        <ul className="m-0 list-none space-y-2 p-0">
          {readiness.map((row) => (
            <li key={row.channel} className="rounded-md border p-3">
              <p className="m-0 font-medium">{CHANNEL_COPY[row.channel]}</p>
              <p className="m-0">{READINESS_COPY[row.status]}</p>
              {row.lastSentAt === null ? null : (
                <p className="m-0">Last test sent {day(row.lastSentAt)}</p>
              )}
            </li>
          ))}
        </ul>
        {kinds.includes('pager') ? <p role="note">{PAGER_STUB_NOTICE}</p> : null}
      </section>
    </main>
  )
}
