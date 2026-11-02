import { eq } from 'drizzle-orm'
import { healthAlerts } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { configuredChannelKinds } from '@/features/health/channels/configured'
import { PAGER_STUB_NOTICE } from '@/features/health/channels/pagerChannel'
import { jobHealth } from '@/features/health/jobHealth'
import { alertReadiness, type ReadinessStatus } from '@/features/health/syntheticAlert'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { todayInTimeZone } from '@/types/civilDate'

export const dynamic = 'force-dynamic'

const READINESS_COPY: Record<ReadinessStatus, string> = {
  acknowledged: 'Acknowledged within the last 30 days',
  sent_unacknowledged: 'Test sent, not acknowledged',
  never_tested: 'Never tested',
}

const CHANNEL_COPY = { email: 'Email', pager: 'Pager' } as const

export default async function HealthPage() {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'config.edit', ctx.signal))) {
    return (
      <main>
        <h1>System health</h1>
        <p role="alert">You do not have permission to see system health.</p>
      </main>
    )
  }
  const now = new Date()
  const kinds = configuredChannelKinds()
  const [jobs, firing, readiness, town] = await Promise.all([
    jobHealth(ctx.db, now, ctx.signal),
    ctx.db.select().from(healthAlerts).where(eq(healthAlerts.state, 'firing')),
    alertReadiness(ctx.db, kinds, now, ctx.signal),
    getTownSettings(ctx.db, ctx.signal),
  ])
  const zone = town.ok ? town.value.timeZone : 'UTC'
  const day = (instant: Date | null) =>
    instant === null ? 'Never' : formatCivilDate(todayInTimeZone(zone, instant))
  return (
    <main>
      <h1>System health</h1>
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
        <ul className="m-0 list-none space-y-2 p-0">
          {jobs.map((job) => (
            <li key={job.name} className="rounded-md border p-3">
              <p className="m-0 font-medium">{job.name}</p>
              <p className="m-0">
                Last success: {day(job.lastSuccessAt)}
                {job.stale ? '. This job is overdue.' : ''}
              </p>
              {job.lastFailureAt === null ? null : (
                <p className="m-0">Last failure: {day(job.lastFailureAt)}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="channels-heading">
        <h2 id="channels-heading">Alert channels</h2>
        {readiness.length === 0 ? <p>No alert channel is configured.</p> : null}
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
