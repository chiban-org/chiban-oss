import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import type { SortState } from '@/features/dataTable/sort'
import { createProject } from '@/features/projects/projects'
import type { QueueSortKey } from '@/features/queue/queueParams'
import { statesForTab } from '@/features/queue/stateScopes'
import { listWorkQueue } from '@/features/queue/workQueue'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { makeParcel } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
const names = new Map<string, string>()

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '009001000000' }])
  const barn = await createProject(handle.db, world.applicant, { parcelId, title: 'Barn' }, signal)
  if (!barn.ok) throw new Error('project failed')
  const inBarn = { ...world, projectId: barn.value.projectId }
  const make = async (name: string, w: PermitWorld, patch: Parameters<typeof makeApplication>[2]) =>
    names.set((await makeApplication(handle.db, w, patch)).applicationId, name)
  await make('garage', world, { state: 'submitted', receivedDate: '2027-01-10' })
  await make('barnIssued', inBarn, { state: 'issued', receivedDate: '2027-02-10' })
  await make('barnDenied', inBarn, { state: 'denied', receivedDate: '2026-12-01' })
  await make('barnSuspended', inBarn, { state: 'suspended', receivedDate: '2027-02-11' })
  await make('draft', world, { state: 'draft' })
  const garage = [...names].find(([, name]) => name === 'garage')?.[0] ?? ''
  await handle.db.insert(clocks).values({
    applicationId: garage,
    ruleKey: 'nh.bp.decision',
    ruleVersion: 1,
    packVersion: '0.3.0',
    startEvent: 'application_completed',
    startDate: '2027-02-01',
    lengthValue: 30,
    lengthUnit: 'days',
    countingMethod: 'test',
    computedDue: '2027-03-01',
    currentDue: '2027-03-01',
    source: 'pack_rule',
    status: 'running',
  })
})
afterAll(async () => {
  await handle.drop()
})

async function sorted(key: QueueSortKey, dir: 'asc' | 'desc'): Promise<string[]> {
  const sort: SortState<QueueSortKey> = { key, dir }
  const page = await listWorkQueue(
    handle.db,
    world.staff,
    { filters: { states: statesForTab('all') ?? [] }, sort, limit: 25 },
    signal,
    NOW,
  )
  return page.rows.map((r) => names.get(r.applicationId) ?? r.applicationId)
}

describe('application list project and received columns', () => {
  it('carries the project title and received date on each row', async () => {
    const page = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: { states: statesForTab('all') ?? [] }, limit: 25 },
      signal,
      NOW,
    )
    const denied = page.rows.find((r) => names.get(r.applicationId) === 'barnDenied')
    expect(denied).toMatchObject({ projectTitle: 'Barn', receivedDate: '2026-12-01' })
    const draft = page.rows.find((r) => names.get(r.applicationId) === 'draft')
    expect(draft?.receivedDate).toBeNull()
  })

  it('sorts by project, breaking ties by due date and then received date', async () => {
    expect(await sorted('project', 'asc')).toEqual([
      'barnDenied',
      'barnIssued',
      'barnSuspended',
      'garage',
      'draft',
    ])
    expect(await sorted('project', 'desc')).toEqual([
      'garage',
      'draft',
      'barnDenied',
      'barnIssued',
      'barnSuspended',
    ])
  })

  it('sorts by received date with no date last both ways', async () => {
    expect(await sorted('received', 'desc')).toEqual([
      'barnSuspended',
      'barnIssued',
      'garage',
      'barnDenied',
      'draft',
    ])
    expect(await sorted('received', 'asc')).toEqual([
      'barnDenied',
      'garage',
      'barnIssued',
      'barnSuspended',
      'draft',
    ])
  })
})
