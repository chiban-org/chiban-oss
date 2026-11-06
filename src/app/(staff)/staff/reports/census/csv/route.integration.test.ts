import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/requireStaff', () => ({
  staffActorOrNull: () => Promise.resolve(state.actor),
}))

const { GET } = await import('./route')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  state.actor = world.staff
  await makeApplication(
    handle.db,
    world,
    {
      state: 'issued',
      issuedOn: '2027-03-10',
      values: {
        work_type: 'building',
        description: 'New single-family house',
        classification: 'residential',
        dwelling_units: 1,
        estimated_cost: '350000.00',
      },
    },
    new Date('2027-01-05T15:00:00Z'),
    'BP',
  )
})
afterAll(async () => {
  await handle.drop()
})

describe('census csv route', () => {
  it('refuses to export a month with an unclassified building permit', async () => {
    const res = await GET(
      new Request('https://alderpond.example/staff/reports/census/csv?year=2027&month=3'),
    )
    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(await res.text()).toBe(
      'This report is not complete. 1 issued building permit needs classification before it can be exported.',
    )
  })

  it('answers year 0 with the town year instead of a server error', async () => {
    const res = await GET(
      new Request('https://alderpond.example/staff/reports/census/csv?year=0&month=year'),
    )
    expect(res.status).not.toBe(500)
    expect(res.headers.get('content-disposition') ?? '').not.toContain('census-building-permits-0')
  })
})
