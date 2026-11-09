import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { listContractorProjects } from '@/features/contractors/dashboard'
import { createProject } from '@/features/projects/projects'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { insertInspection } from '@/test/inspectionFixtures'
import { submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { makeParcel } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-10T15:00:00Z')
const SITE_PLAN = {
  key: 'site_plan',
  label: 'Site plan.',
  stage: 'to_file' as const,
  waivable: false,
}

let handle: TestDb
let world: PermitWorld
let trade: TradeFixture
let contractor: Actor
let reviewApplicationId = ''

async function nameContractor(projectId: string, userId: string) {
  await handle.db.insert(projectParties).values({
    projectId,
    userId,
    email: 'pat@builder.example',
    name: 'Pat Builder',
    role: 'contractor',
    addedBy: userId,
  })
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.electrical'],
    buildingType: { documents: [SITE_PLAN] },
  })
  trade = await submittedTrade(handle.db, world, NOW)
  const review = await makeApplication(handle.db, world, { state: 'submitted' }, NOW, 'BP')
  reviewApplicationId = review.applicationId
  await insertInspection(handle.db, trade.applicationId, 'rough', {
    status: 'scheduled',
    scheduledDate: '2027-03-12',
    startMinute: 540,
  })
  await insertInspection(handle.db, trade.applicationId, 'final', {
    status: 'scheduled',
    scheduledDate: '2027-03-08',
    startMinute: 540,
  })
  await insertInspection(handle.db, trade.applicationId, 'rough', {
    status: 'scheduled',
    scheduledDate: '2027-04-20',
    startMinute: 540,
  })
  const userId = await makeUser(handle.db, { role: 'applicant', email: 'pat@builder.example' })
  contractor = (await loadActor(handle.db, userId, signal)) as Actor
  await nameContractor(world.projectId, userId)
})
afterAll(async () => {
  await handle.drop()
})

const list = (input: Parameters<typeof listContractorProjects>[2] = { limit: 25 }) =>
  listContractorProjects(handle.db, contractor, input, signal, NOW)

describe('contractor dashboard needs', () => {
  it('names the balance due on an application and links to pay it', async () => {
    const { needs } = await list()
    const pay = needs.find((n) => n.kind === 'pay')
    expect(pay?.text).toContain('$45.00')
    expect(pay?.text).toContain(trade.number)
    expect(pay?.href).toBe(`/portal/applications/${trade.applicationId}#fees-heading`)
  })

  it('names the documents requested for the stage the application is in', async () => {
    const { needs } = await list()
    const docs = needs.find((n) => n.kind === 'documents')
    expect(docs?.text).toContain('Site plan')
    expect(docs?.href).toBe(`/portal/applications/${reviewApplicationId}#documents-heading`)
  })

  it('lists an inspection with no result and one in the next 7 days but not a later one', async () => {
    const { needs } = await list()
    expect(needs.filter((n) => n.kind === 'result')).toHaveLength(1)
    expect(needs.filter((n) => n.kind === 'inspection')).toHaveLength(1)
    expect(needs.find((n) => n.kind === 'inspection')?.text).toContain('March 12, 2027')
  })

  it('puts payment first and inspections last', async () => {
    const { needs } = await list()
    expect(needs.map((n) => n.kind)).toEqual(['pay', 'documents', 'result', 'inspection'])
  })

  it('puts the balance and next inspection on the application row', async () => {
    const { rows } = await list()
    const app = rows
      .flatMap((r) => r.applications)
      .find((a) => a.applicationId === trade.applicationId)
    expect(app?.dueCents).toBe(4500)
    expect(app?.upcoming.map((u) => u.date)).toEqual(['2027-03-12', '2027-04-20'])
  })
})

describe('contractor dashboard filtering', () => {
  it('counts projects per status tab', async () => {
    const { counts } = await list()
    expect(counts).toEqual({ all: 1, review: 1, issued: 0, closed: 0 })
  })

  it('shows only the applications in the chosen tab and nothing for an empty tab', async () => {
    const review = await list({ limit: 25, tab: 'review' })
    expect(review.rows).toHaveLength(1)
    expect(review.rows[0]?.applications).toHaveLength(2)
    const issued = await list({ limit: 25, tab: 'issued' })
    expect(issued.rows).toEqual([])
    expect(issued.total).toBe(0)
  })

  it('finds an application by its number, case-insensitively', async () => {
    const found = await list({ limit: 25, q: trade.number.toLowerCase() })
    expect(found.rows[0]?.applications.map((a) => a.number)).toEqual([trade.number])
    expect((await list({ limit: 25, q: 'zz-nothing' })).rows).toEqual([])
  })

  it('treats percent and underscore in a search as plain characters', async () => {
    expect((await list({ limit: 25, q: '%' })).rows).toEqual([])
    expect((await list({ limit: 25, q: '_' })).rows).toEqual([])
  })

  it('pages with both a next and a previous link', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007002000000' }])
    const second = await createProject(
      handle.db,
      world.applicant,
      { parcelId, title: 'Porch' },
      signal,
    )
    if (!second.ok) throw new Error('project')
    await nameContractor(second.value.projectId, contractor.userId)
    const first = await list({ limit: 1 })
    expect(first.total).toBe(2)
    expect(first.prevCursor).toBeNull()
    expect(first.nextCursor).toBe('1')
    const next = await list({ limit: 1, cursor: '1' })
    expect(next.rows).toHaveLength(1)
    expect(next.nextCursor).toBeNull()
    expect(next.prevCursor).toBe('0')
    expect(next.rows[0]?.projectId).not.toBe(first.rows[0]?.projectId)
  })
})
