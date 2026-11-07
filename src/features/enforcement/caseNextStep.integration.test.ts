import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { EVERY_CASE_ABILITY, nextStepOf } from '@/features/enforcement/caseNextStep'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { planCaseWork } from '@/features/enforcement/workPlan'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let actor: Actor
let today: CivilDate

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
  })
  const loaded = await loadActor(handle.db, user?.id ?? '', signal)
  if (loaded === null) throw new Error('no actor')
  actor = loaded
  today = await townToday(handle.db, new Date(), signal)
})
afterAll(async () => {
  await handle.drop()
})

describe('next step and due on the enforcement list', () => {
  it('equal the case plan for every demo case', async () => {
    const queue = await listCaseQueue(
      handle.db,
      actor,
      { filters: {}, limit: 50, offset: 0 },
      today,
      signal,
    )
    expect(queue.rows.length).toBeGreaterThanOrEqual(7)
    const statuses = new Set(queue.rows.map((r) => r.status))
    for (const status of ['intake', 'violation_found', 'order_issued', 'in_court']) {
      expect(statuses.has(status as never)).toBe(true)
    }
    for (const row of queue.rows) {
      const detail = await loadCaseDetail(handle.db, actor, row.caseId, today, signal)
      if (!detail.ok) throw new Error(`no detail for ${row.number}`)
      const plan = planCaseWork(detail.value, { abilities: EVERY_CASE_ABILITY, responsible: null })
      expect({ number: row.number, step: row.nextStep, due: row.due }).toEqual({
        number: row.number,
        step: nextStepOf(plan),
        due: plan.due,
      })
      expect(row.stay.stayed).toBe(detail.value.stay.stayed)
    }
  })

  it('names who acts for the stayed and in-court demo cases', async () => {
    const queue = await listCaseQueue(
      handle.db,
      actor,
      { filters: {}, limit: 50, offset: 0 },
      today,
      signal,
    )
    const byNumber = new Map(queue.rows.map((r) => [r.number, r]))
    expect(byNumber.get('EC-2026-0004')?.nextStep).toEqual({
      actor: 'ZBA',
      ask: 'decide the appeal',
    })
    expect(byNumber.get('EC-2026-0004')?.due).toBeNull()
    expect(byNumber.get('EC-2026-0007')?.nextStep).toEqual({
      actor: 'Town',
      ask: 'start the investigation',
    })
  })

  it('sorts by due with the plan dates and cases without one last in both directions', async () => {
    for (const dir of ['asc', 'desc'] as const) {
      const queue = await listCaseQueue(
        handle.db,
        actor,
        { filters: {}, sort: { key: 'next', dir }, limit: 50, offset: 0 },
        today,
        signal,
      )
      const dates = queue.rows.map((r) => r.due?.date ?? null)
      const dated = dates.filter((d): d is CivilDate => d !== null)
      expect(dated).toEqual([...dated].sort(dir === 'asc' ? undefined : (a, b) => (a < b ? 1 : -1)))
      expect(dates.slice(dated.length).every((d) => d === null)).toBe(true)
    }
  })

  it('filters on the plan due', async () => {
    const all = await listCaseQueue(
      handle.db,
      actor,
      { filters: {}, limit: 50, offset: 0 },
      today,
      signal,
    )
    const none = await listCaseQueue(
      handle.db,
      actor,
      { filters: { due: ['none'] }, limit: 50, offset: 0 },
      today,
      signal,
    )
    expect(none.rows.map((r) => r.caseId).sort()).toEqual(
      all.rows
        .filter((r) => r.due === null)
        .map((r) => r.caseId)
        .sort(),
    )
    const overdue = await listCaseQueue(
      handle.db,
      actor,
      { filters: { due: ['overdue'] }, limit: 50, offset: 0 },
      today,
      signal,
    )
    expect(overdue.rows.map((r) => r.caseId).sort()).toEqual(
      all.rows
        .filter((r) => r.due !== null && r.due.daysLeft < 0)
        .map((r) => r.caseId)
        .sort(),
    )
  })
})
