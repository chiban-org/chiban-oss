import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { healthAlerts, jobEffects, jobRuns } from '@/db/schema'
import { createEmailChannel } from '@/features/health/channels/emailChannel'
import { createPagerChannel } from '@/features/health/channels/pagerChannel'
import { jobsHealthResponse } from '@/features/health/jobsRoute'
import { recordWorkerStart } from '@/features/health/workerState'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { runJob } from '@/jobs/defineJob'
import { type HealthCheckJobDeps, makeHealthCheckJob } from '@/jobs/healthCheck'
import { makeTestDb, type TestDb } from '@/test/db'
import { type PagerFakeServer, startPagerFakeServer } from '@/test/fakes/pagerFakeServer'
import { seedTown } from '@/test/parcels'

const signal = new AbortController().signal
const T0 = new Date('2026-11-02T12:00:00Z')
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)
const HEARTBEAT = JOB_NAMES.HEARTBEAT
const KEY = `job_stale:${HEARTBEAT}`
let handle: TestDb
let pager: PagerFakeServer
let ping: Server
let pingHits: { alertsAtPing: number }[]
let pingUrl = ''

beforeAll(async () => {
  handle = await makeTestDb()
  await seedTown(handle.db)
  pager = await startPagerFakeServer()
  ping = createServer((_req, res) => {
    void handle.db
      .select({ n: sql<number>`count(*)::int` })
      .from(healthAlerts)
      .then(([row]) => {
        pingHits.push({ alertsAtPing: row?.n ?? 0 })
        res.writeHead(200).end('ok')
      })
  })
  await new Promise<void>((resolve) => ping.listen(0, '127.0.0.1', resolve))
  pingUrl = `http://127.0.0.1:${(ping.address() as AddressInfo).port}/ping`
})
afterAll(async () => {
  await pager.stop()
  ping.closeAllConnections()
  await new Promise<void>((resolve) => ping.close(() => resolve()))
  await handle.drop()
})
beforeEach(async () => {
  pingHits = []
  pager.requests.length = 0
  await handle.db.delete(healthAlerts)
  await handle.db.delete(jobRuns)
  await handle.db.delete(jobEffects)
  await recordWorkerStart(handle.db, at(-600), signal)
  await handle.db.insert(jobRuns).values({ jobName: HEARTBEAT, lastSuccessAt: at(-11) })
})

function setup(overrides: Partial<HealthCheckJobDeps> = {}) {
  const mail = createMemoryTransport()
  const channels = [
    createEmailChannel(mail, ['ops@alderpond.example']),
    createPagerChannel({ eventsUrl: pager.eventsUrl, routingKey: 'rk-test' }, { fetch }),
  ]
  let now = T0
  const deps: HealthCheckJobDeps = {
    channels: () => channels,
    listSchedules: () => Promise.resolve([HEARTBEAT]),
    diskUsage: () => Promise.resolve([]),
    diskPaths: () => ['/'],
    heartbeatUrl: () => undefined,
    fetch,
    now: () => now,
    jobs: [{ name: HEARTBEAT, intervalSeconds: 300 }],
    ...overrides,
  }
  const job = makeHealthCheckJob(deps)
  return {
    mail,
    run: async (minutes: number) => {
      now = at(minutes)
      return await runJob(handle.db, job, { at: now.toISOString() }, signal)
    },
  }
}

describe('health.check', () => {
  it('a new firing alert emails once and not again within 24 hours', async () => {
    const { mail, run } = setup()
    await run(0)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]?.subject).toBe(
      `[critical] Town of Alder Pond: Job ${HEARTBEAT} has not succeeded recently`,
    )
    await run(10)
    await run(23 * 60)
    expect(mail.sent).toHaveLength(1)
    await run(25 * 60)
    expect(mail.sent).toHaveLength(2)
  })

  it('a resolved alert emails a resolution', async () => {
    const { mail, run } = setup()
    await run(0)
    await handle.db
      .update(jobRuns)
      .set({ lastSuccessAt: at(9) })
      .where(eq(jobRuns.jobName, HEARTBEAT))
    await run(10)
    expect(mail.sent).toHaveLength(2)
    expect(mail.sent[1]?.subject).toContain('Resolved')
    const [row] = await handle.db.select().from(healthAlerts).where(eq(healthAlerts.key, KEY))
    expect(row).toMatchObject({ state: 'resolved' })
    expect(row?.resolvedAt).not.toBeNull()
  })

  it('pager fake receives trigger then resolve with the same dedup key', async () => {
    const { run } = setup()
    await run(0)
    await handle.db
      .update(jobRuns)
      .set({ lastSuccessAt: at(9) })
      .where(eq(jobRuns.jobName, HEARTBEAT))
    await run(10)
    const bodies = pager.requests.map((r) => r.body as Record<string, unknown>)
    expect(bodies.map((b) => b.event_action)).toEqual(['trigger', 'resolve'])
    expect(bodies[0]?.dedup_key).toBe(KEY)
    expect(bodies[1]?.dedup_key).toBe(KEY)
    expect(bodies[0]).toMatchObject({
      routing_key: 'rk-test',
      payload: { source: 'Town of Alder Pond', severity: 'critical' },
    })
  })

  it('a notification that reached no channel is retried on the next run', async () => {
    const failingMail = {
      send: () => Promise.resolve({ ok: false as const, error: 'send_failed' as const }),
    }
    const { run } = setup({
      channels: () => [
        createEmailChannel(failingMail, ['ops@alderpond.example']),
        createPagerChannel({ eventsUrl: pager.eventsUrl, routingKey: 'rk-test' }, { fetch }),
      ],
    })
    pager.failNext(500)
    await run(0)
    await run(5)
    await run(10)
    const actions = pager.requests.map((r) => (r.body as { event_action: string }).event_action)
    expect(actions).toEqual(['trigger', 'trigger'])
  })

  it('health check pings the heartbeat url after evaluating', async () => {
    const { run } = setup({ heartbeatUrl: () => pingUrl })
    await run(0)
    expect(pingHits).toEqual([{ alertsAtPing: 1 }])
  })

  it('does not ping when no heartbeat url is configured', async () => {
    const { run } = setup()
    await run(0)
    expect(pingHits).toEqual([])
  })

  it('reports a schedule missing from the pg-boss list', async () => {
    const { mail, run } = setup({ listSchedules: () => Promise.resolve([]) })
    await handle.db
      .update(jobRuns)
      .set({ lastSuccessAt: at(-1) })
      .where(eq(jobRuns.jobName, HEARTBEAT))
    await run(0)
    const rows = await handle.db.select().from(healthAlerts)
    expect(rows.map((r) => r.key)).toEqual([`schedule_missing:${HEARTBEAT}`])
    expect(mail.sent).toHaveLength(1)
  })

  it('reports a full disk', async () => {
    const { run } = setup({
      diskUsage: () => Promise.resolve([{ path: '/data', usedRatio: 0.93 }]),
    })
    await handle.db
      .update(jobRuns)
      .set({ lastSuccessAt: at(-1) })
      .where(eq(jobRuns.jobName, HEARTBEAT))
    await run(0)
    const rows = await handle.db.select().from(healthAlerts)
    expect(rows).toMatchObject([{ key: 'disk:/data', kind: 'disk_critical', severity: 'critical' }])
  })
})

describe('/api/health/jobs', () => {
  it('jobs route returns 503 naming the firing alert and 200 when nothing fires', async () => {
    const { run } = setup()
    const quiet = await jobsHealthResponse(handle.db, signal)
    expect(quiet.status).toBe(200)
    await run(0)
    const loud = await jobsHealthResponse(handle.db, signal)
    expect(loud.status).toBe(503)
    expect(await loud.json()).toEqual({
      status: 'alerting',
      alerts: [{ key: KEY, kind: 'job_stale' }],
    })
    await handle.db
      .update(jobRuns)
      .set({ lastSuccessAt: at(9) })
      .where(eq(jobRuns.jobName, HEARTBEAT))
    await run(10)
    expect((await jobsHealthResponse(handle.db, signal)).status).toBe(200)
  })
})
