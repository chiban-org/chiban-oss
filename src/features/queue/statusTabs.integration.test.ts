import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import type { CoreState } from '@/features/applications/states'
import { queueFacets } from '@/features/queue/queueFacets'
import { type StatusTab, statesForTab } from '@/features/queue/stateScopes'
import { listWorkQueue, type WorkQueueFilters } from '@/features/queue/workQueue'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
let made: Map<string, string>

async function make(state: CoreState): Promise<string> {
  return (await makeApplication(handle.db, world, { state })).applicationId
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  made = new Map()
  for (const state of ['draft', 'submitted', 'issued', 'suspended', 'closed', 'denied'] as const) {
    made.set(state, await make(state))
  }
  made.set('deniedRunning', await make('denied'))
  await handle.db.insert(clocks).values({
    applicationId: made.get('deniedRunning') ?? '',
    ruleKey: 'nh.bp.decision',
    ruleVersion: 1,
    packVersion: '0.3.0',
    startEvent: 'application_completed',
    startDate: '2027-02-01',
    lengthValue: 30,
    lengthUnit: 'days',
    countingMethod: 'test',
    computedDue: '2027-03-10',
    currentDue: '2027-03-10',
    source: 'pack_rule',
    status: 'running',
  })
})
afterEach(async () => {
  await handle.drop()
})

function tabFilters(tab: StatusTab, extra: WorkQueueFilters = {}): WorkQueueFilters {
  const states = statesForTab(tab)
  return { ...extra, ...(states === undefined ? {} : { states }) }
}

async function listed(tab: StatusTab, actor = world.staff): Promise<string[]> {
  const page = await listWorkQueue(
    handle.db,
    actor,
    { filters: tabFilters(tab), limit: 50 },
    signal,
    NOW,
  )
  const names = new Map([...made].map(([name, id]) => [id, name]))
  return page.rows.map((r) => names.get(r.applicationId) ?? r.applicationId).sort()
}

describe('application status tabs', () => {
  it('needs action leaves drafts and finished work out but keeps a running deadline', async () => {
    expect(await listed('action')).toEqual(['deniedRunning', 'issued', 'submitted', 'suspended'])
  })

  it('open holds the drafts, issued holds suspended permits, finished holds denials', async () => {
    expect(await listed('open')).toEqual(['draft', 'submitted'])
    expect(await listed('issued')).toEqual(['issued', 'suspended'])
    expect(await listed('finished')).toEqual(['closed', 'denied', 'deniedRunning'])
  })

  it('all lists everything, drafts included', async () => {
    expect(await listed('all')).toEqual([...made.keys()].sort())
  })

  it('counts each tab with the other filters applied and ignores the chosen tab', async () => {
    const counts = async (filters: WorkQueueFilters) =>
      Object.fromEntries(
        (await queueFacets(handle.db, world.staff, { filters, now: NOW }, signal)).stages,
      )
    const expected = { action: 4, open: 2, issued: 2, finished: 3, all: 7 }
    expect(await counts(tabFilters('action'))).toEqual(expected)
    expect(await counts(tabFilters('finished'))).toEqual(expected)
    expect(await counts(tabFilters('all', { due: ['none'] }))).toEqual({
      action: 3,
      open: 2,
      issued: 2,
      finished: 2,
      all: 6,
    })
  })

  it('narrows a tab to chosen states and counts states inside the tab only', async () => {
    const page = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: tabFilters('all', { stateKeys: ['denied', 'draft'] }), limit: 50 },
      signal,
      NOW,
    )
    expect(page.total).toBe(3)
    const facets = await queueFacets(
      handle.db,
      world.staff,
      { filters: tabFilters('finished', { stateKeys: ['denied'] }), now: NOW },
      signal,
    )
    expect(Object.fromEntries(facets.states)).toMatchObject({ closed: 1, denied: 2, draft: 0 })
    expect(Object.fromEntries(facets.stages)).toMatchObject({ issued: 2, finished: 3, all: 7 })
  })

  it('scopes every tab to what a reviewer is assigned', async () => {
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: made.get('submitted') ?? '', reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect(await listed('all', world.reviewer)).toEqual(['submitted'])
    expect(await listed('open', world.reviewer)).toEqual(['submitted'])
    expect(await listed('finished', world.reviewer)).toEqual([])
  })
})
