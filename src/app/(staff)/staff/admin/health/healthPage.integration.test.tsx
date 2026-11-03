import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { healthAlerts, jobRuns, workerState } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { recordWorkerStart } from '@/features/health/workerState'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => {
  const env = process.env as Record<string, string | undefined>
  env.ALERT_EMAIL_TO = 'ops@alderpond.example'
  env.PAGER_EVENTS_URL = 'http://127.0.0.1:9/v2/enqueue'
  env.PAGER_ROUTING_KEY = 'rk-test'
  return { db: null, actor: null }
})

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: HealthPage } = await import('./page')
const { PAGER_CHANNEL_STATUS, PAGER_STUB_NOTICE } = await import(
  '@/features/health/channels/pagerChannel'
)

let handle: TestDb
let admin: Actor
let staff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  staff = await staffActor(handle.db, 'staff')
  await handle.db.insert(healthAlerts).values({
    key: 'disk:/data',
    kind: 'disk_warning',
    severity: 'warning',
    state: 'firing',
    summary: 'Disk /data is 85% full',
    firstSeenAt: new Date('2026-11-02T15:00:00Z'),
    lastSeenAt: new Date('2026-11-02T15:00:00Z'),
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('admin health page', () => {
  it('shows job health, the firing alert, channel readiness and a long-form town date', async () => {
    state.actor = admin
    const html = renderToStaticMarkup(await HealthPage())
    expect(html).toContain('System heartbeat')
    expect(html).not.toContain('system.heartbeat')
    expect(html).toContain('Disk /data is 85% full')
    expect(html).toContain('November 2, 2026')
    expect(html).toContain('Never tested')
    expect(html).toContain('Email')
  })

  it('shows the stub notice when the pager channel is configured', async () => {
    state.actor = admin
    const html = renderToStaticMarkup(await HealthPage())
    expect(PAGER_CHANNEL_STATUS).toBe('stubbed')
    expect(PAGER_STUB_NOTICE).toBe(
      'Pager alerts are not connected to a live service. They are sent to the address you configured and have only been tested against a local stand-in.',
    )
    expect(html).toContain(PAGER_STUB_NOTICE)
  })

  it('says plainly when no background worker has ever started', async () => {
    state.actor = admin
    await handle.db.delete(workerState)
    const html = renderToStaticMarkup(await HealthPage())
    expect(html).toContain(
      'No background worker has started for this town. Until one runs, no job on this page runs: emails stay queued and exports stay waiting to start.',
    )
  })

  it('shows when the background worker last started', async () => {
    state.actor = admin
    await recordWorkerStart(
      handle.db,
      new Date('2026-11-02T14:00:00Z'),
      new AbortController().signal,
    )
    const html = renderToStaticMarkup(await HealthPage())
    expect(html).toContain('The background worker last started November 2, 2026')
    expect(html).not.toContain('No background worker has started')
  })

  it('opens failed jobs at the top and lists the rest one line each in a table', async () => {
    state.actor = admin
    await handle.db.insert(jobRuns).values([
      { jobName: 'clocks.daily', lastFailureAt: new Date('2026-11-02T12:00:00Z') },
      { jobName: 'system.heartbeat', lastSuccessAt: new Date() },
    ])
    const html = renderToStaticMarkup(await HealthPage())
    const attention = html.slice(html.indexOf('Needs attention'), html.indexOf('<table'))
    expect(attention).toContain('Daily clock check')
    expect(attention).not.toContain('System heartbeat')
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'))
    expect(table).toContain('System heartbeat')
    expect(table).not.toContain('Daily clock check')
  })

  it('tells staff without the capability they cannot use it', async () => {
    state.actor = staff
    const html = renderToStaticMarkup(await HealthPage())
    expect(html).toContain('You do not have permission')
    expect(html).not.toContain('Disk /data')
    expect(html).not.toContain('Pager alerts are not connected')
  })

  it('redirects a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(HealthPage()).rejects.toThrow('NEXT_REDIRECT:/staff/sign-in')
  })
})
