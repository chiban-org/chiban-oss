import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { healthAlerts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
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
    expect(html).toContain('system.heartbeat')
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
