import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { listWorkQueue } from '@/features/queue/workQueue'
import { loadClerkSection } from '@/features/staffHome/clerkHome'
import type { HomeSection } from '@/features/staffHome/homeTypes'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { homeContextFor } from '@/test/homeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const MOST_DAYS_OVERDUE = 28
const THIS_WEEK_DAYS = 7
const QUEUE_LIMIT = 200

type Deadlines = Extract<HomeSection['detail'], { kind: 'deadlines' }>['rows']

describe.each([
  ['a reset over the new year', '2026-12-30T16:00:00Z'],
  ['a reset months after the story was written', '2027-03-16T16:00:00Z'],
])('the demo seeded on %s', (_label, instant) => {
  const now = new Date(instant)
  let handle: TestDb
  let clerk: Actor
  let today: CivilDate

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now, shouldAdvanceTime: true })
    handle = await makeTestDb()
    await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
    const row = await handle.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
    })
    const actor = await loadActor(handle.db, row?.id ?? '', signal)
    if (actor === null) throw new Error('no clerk')
    clerk = actor
    today = await townToday(handle.db, now, signal)
  })
  afterAll(async () => {
    vi.useRealTimers()
    await handle.drop()
  })

  it("shows upcoming deadlines on the clerk's Today page, some of them this week", async () => {
    const section = await loadClerkSection(await homeContextFor(handle.db, clerk, now))
    const rows: Deadlines = section?.detail?.kind === 'deadlines' ? section.detail.rows : []
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.nextDue !== null && r.nextDue >= today)).toBe(true)
    expect(rows.some((r) => (r.daysUntilDue ?? Number.POSITIVE_INFINITY) <= THIS_WEEK_DAYS)).toBe(
      true,
    )
  })

  it('has a few applications past a deadline, none of them by more than four weeks', async () => {
    const overdue = await listWorkQueue(
      handle.db,
      clerk,
      { filters: { due: ['overdue'] }, limit: QUEUE_LIMIT },
      signal,
      now,
    )
    expect(overdue.rows.length).toBeGreaterThan(0)
    const late = overdue.rows
      .filter((r) => (r.daysUntilDue ?? 0) < -MOST_DAYS_OVERDUE)
      .map((r) => `${r.number} ${r.projectTitle} ${r.nextDue}`)
    expect(late).toEqual([])
  })
})
