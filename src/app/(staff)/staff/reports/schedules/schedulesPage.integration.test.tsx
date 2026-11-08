import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { reportSchedules, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createSchedule } from '@/features/reports/schedules'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))

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

const { default: SchedulesPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb
let staff: Actor
let inspector: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  inspector = await staffActor(handle.db, 'inspector')
  await handle.db.update(users).set({ displayName: 'Sam Clerk' }).where(eq(users.id, staff.userId))
  const made = await createSchedule(
    handle.db,
    staff,
    {
      report: 'permit-volume',
      frequency: 'monthly',
      recipientIds: [staff.userId],
      now: new Date('2026-11-08T15:00:00Z'),
    },
    signal,
  )
  if (!made.ok) throw new Error('create failed')
  await handle.db
    .update(reportSchedules)
    .set({ lastSentAt: new Date('2026-11-01T11:00:00Z') })
    .where(eq(reportSchedules.id, made.value.id))
})
afterAll(async () => {
  await handle.drop()
})

describe('scheduled reports page', () => {
  it('lists each schedule with who gets it, the next run and the last send', async () => {
    state.actor = staff
    const html = renderToStaticMarkup(await SchedulesPage())
    expect(html).toContain('Scheduled reports')
    expect(html).toContain('Schedule a report')
    expect(html).toContain('<td>Permit volume</td>')
    expect(html).toContain('Monthly')
    expect(html).toContain('Sam Clerk')
    expect(html).toContain('December 1, 2026')
    expect(html).toContain('November 1, 2026')
    expect(html).toContain('Active')
    expect(html).toContain('aria-label="Edit Permit volume, monthly"')
  })

  it('tells someone without the reports capability they cannot schedule reports', async () => {
    state.actor = inspector
    const html = renderToStaticMarkup(await SchedulesPage())
    expect(html).toContain('You do not have permission to schedule reports.')
  })
})
