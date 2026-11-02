import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { compareTowns } from '@/features/export/compareTowns'
import { importArchive } from '@/features/export/importArchive'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { buildTar, freshTarget, sourceOf } from '@/test/roundTrip'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => {
  const env = process.env as Record<string, string | undefined>
  env.ALERT_EMAIL_TO = 'ops@alderpond.example'
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

const { default: HealthPage } = await import('@/app/(staff)/staff/admin/health/page')
const { default: ReportsPage } = await import('@/app/(staff)/staff/reports/page')

const signal = new AbortController().signal
let handle: TestDb

async function actorOf(local: string): Promise<Actor> {
  const row = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  return (await loadActor(handle.db, row?.id ?? '', signal)) as Actor
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, await demoSeedDeps())
}, 300_000)
afterAll(async () => {
  await handle.drop()
})

describe('seeded operations screens', () => {
  it('seeded admin health page lists the firing alert and an acknowledged email channel', async () => {
    state.actor = await actorOf('admin')
    const html = renderToStaticMarkup(await HealthPage())
    expect(html).toContain('has not succeeded recently')
    expect(html).toContain('Acknowledged within the last 30 days')
    expect(html).toContain('Email')
    expect(html).toContain('This job is overdue.')
  })

  it('seeded reports page renders nonzero volume, processing time, and revenue rows', async () => {
    state.actor = await actorOf('staff')
    const search = { from: '2027-01-01', to: '2027-12-31' }
    const html = renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(search) }))
    for (const heading of ['Permit volume', 'Processing time', 'Revenue']) {
      const section = html.split(`<h2>${heading}</h2>`)[1]?.split('<h2>')[0] ?? ''
      const rows = section.split('<tbody>')[1]?.split('</tbody>')[0] ?? ''
      expect(rows, heading).toContain('<tr')
    }
    const revenue = html.split('<h2>Revenue</h2>')[1]?.split('<h2>')[0] ?? ''
    expect(revenue).toMatch(/\$[1-9][\d,]*\.\d\d/)
  })

  it('seeded export round-trips', async () => {
    const store = getObjectStore()
    const tar = await buildTar(handle.db, store, signal)
    const { target, store: targetStore } = await freshTarget()
    try {
      const result = await importArchive(target.db, targetStore, sourceOf(tar), signal)
      expect(result.ok, JSON.stringify(result)).toBe(true)
      const diffs = await compareTowns(handle.db, target.db, signal)
      expect(diffs.filter((d) => d.onlyInA + d.onlyInB + d.differing > 0)).toEqual([])
    } finally {
      await target.drop()
    }
  }, 120_000)
})
