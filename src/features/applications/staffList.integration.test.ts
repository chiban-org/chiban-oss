import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { listStaffApplications, staffApplicationFacets } from '@/features/applications/staffList'
import type { ApplicationSortKey, StaffListFilters } from '@/features/applications/staffListParams'
import type { SortState } from '@/features/dataTable/sort'
import { createProject } from '@/features/projects/projects'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { makeParcel } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
let garage = ''
let barnSuspended = ''
let barnIssued = ''
let barnDenied = ''
let draft = ''

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '009001000000' }])
  const barn = await createProject(handle.db, world.applicant, { parcelId, title: 'Barn' }, signal)
  if (!barn.ok) throw new Error('project failed')
  const inBarn = { ...world, projectId: barn.value.projectId }
  const make = async (w: PermitWorld, patch: Parameters<typeof makeApplication>[2], type = 'BP') =>
    (await makeApplication(handle.db, w, patch, undefined, type)).applicationId
  garage = await make(world, { state: 'submitted', receivedDate: '2027-01-10' })
  barnIssued = await make(inBarn, { state: 'issued', receivedDate: '2027-02-10' }, 'EL')
  barnDenied = await make(inBarn, { state: 'denied', receivedDate: '2026-12-01' })
  barnSuspended = await make(inBarn, { state: 'suspended', receivedDate: '2027-02-10' })
  draft = await make(world, { state: 'draft' })
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
  await assignReviewer(
    handle.db,
    world.staff,
    { applicationId: barnIssued, reviewerUserId: world.reviewer.userId },
    signal,
  )
})
afterAll(async () => {
  await handle.drop()
})

async function page(
  options: {
    filters?: StaffListFilters
    sort?: SortState<ApplicationSortKey>
    limit?: number
    offset?: number
  } = {},
) {
  return await listStaffApplications(
    handle.db,
    world.staff,
    {
      filters: options.filters ?? {},
      ...(options.sort === undefined ? {} : { sort: options.sort }),
      limit: options.limit ?? 25,
      offset: options.offset ?? 0,
      now: NOW,
    },
    signal,
  )
}

const ids = async (options: Parameters<typeof page>[0]) =>
  (await page(options)).rows.map((r) => r.id)
const by = (key: ApplicationSortKey, dir: 'asc' | 'desc') => ({ sort: { key, dir } })

describe('staff applications list sorting', () => {
  it('opens newest first, drafts included', async () => {
    expect(await ids({})).toEqual([draft, barnSuspended, barnDenied, barnIssued, garage])
  })

  it('sorts by number, then by project with the newest first inside a tie', async () => {
    expect(await ids(by('number', 'asc'))).toEqual([
      garage,
      barnDenied,
      barnSuspended,
      draft,
      barnIssued,
    ])
    expect(await ids(by('project', 'asc'))).toEqual([
      barnSuspended,
      barnDenied,
      barnIssued,
      draft,
      garage,
    ])
  })

  it('sorts by the parcel display id, not the parcel uuid', async () => {
    expect(await ids(by('parcel', 'asc'))).toEqual([
      draft,
      garage,
      barnSuspended,
      barnDenied,
      barnIssued,
    ])
    expect(await ids(by('parcel', 'desc'))).toEqual([
      barnSuspended,
      barnDenied,
      barnIssued,
      draft,
      garage,
    ])
  })

  it('sorts by workflow state and by received date with no date last both ways', async () => {
    expect(await ids(by('state', 'asc'))).toEqual([
      draft,
      garage,
      barnIssued,
      barnDenied,
      barnSuspended,
    ])
    expect(await ids(by('received', 'desc'))).toEqual([
      barnSuspended,
      barnIssued,
      garage,
      barnDenied,
      draft,
    ])
    expect(await ids(by('received', 'asc'))).toEqual([
      barnDenied,
      garage,
      barnSuspended,
      barnIssued,
      draft,
    ])
  })

  it('pages a non-default sort by offset without repeating or skipping', async () => {
    const all = await ids(by('project', 'asc'))
    const first = await page({ ...by('project', 'asc'), limit: 2 })
    const second = await page({ ...by('project', 'asc'), limit: 2, offset: first.nextOffset ?? 0 })
    const third = await page({ ...by('project', 'asc'), limit: 2, offset: second.nextOffset ?? 0 })
    expect(first).toMatchObject({ total: 5, offset: 0, prevOffset: null, nextOffset: 2 })
    expect(second).toMatchObject({ offset: 2, prevOffset: 0, nextOffset: 4 })
    expect(third).toMatchObject({ offset: 4, prevOffset: 2, nextOffset: null })
    expect([...first.rows, ...second.rows, ...third.rows].map((r) => r.id)).toEqual(all)
  })
})

describe('staff applications list quick filters', () => {
  it('filters by type and by state group', async () => {
    expect(await ids({ filters: { typeKeys: ['EL'] } })).toEqual([barnIssued])
    expect(await ids({ filters: { stateGroups: ['open'] } })).toEqual([draft, garage])
    expect(await ids({ filters: { stateGroups: ['issued'] } })).toEqual([barnSuspended, barnIssued])
    expect(await ids({ filters: { stateGroups: ['finished'] } })).toEqual([barnDenied])
    expect(await ids({ filters: { stateGroups: ['open', 'finished'] } })).toEqual([
      draft,
      barnDenied,
      garage,
    ])
  })

  it('filters by deadline and assignment, combined with the other groups', async () => {
    expect(await ids({ filters: { due: ['overdue'] } })).toEqual([garage])
    expect(await ids({ filters: { due: ['none'], typeKeys: ['BP'] } })).toEqual([
      draft,
      barnSuspended,
      barnDenied,
    ])
    expect(await ids({ filters: { assigned: ['none'], stateGroups: ['issued'] } })).toEqual([
      barnSuspended,
    ])
  })

  it('counts each chip with the other groups applied and lists every type in view', async () => {
    const facets = await staffApplicationFacets(
      handle.db,
      world.staff,
      { filters: { typeKeys: ['BP'] }, now: NOW },
      signal,
    )
    expect([...facets.stateGroups]).toEqual([
      ['open', 2],
      ['issued', 1],
      ['finished', 1],
    ])
    expect(facets.due.get('overdue')).toBe(1)
    expect(facets.types).toEqual([
      { value: 'BP', label: 'Building permit', count: 4 },
      { value: 'EL', label: 'Electrical permit', count: 1 },
    ])
  })
})
