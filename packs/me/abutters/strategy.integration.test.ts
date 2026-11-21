import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { loadListView } from '@/features/abutters/listView'
import { projectedSridParam } from '@/features/abutters/projection/srid'
import { currentIssuedList, snapshotHash } from '@/features/abutters/queries'
import { abutterStrategy } from '@/features/abutters/registry'
import type { CandidateSelection, StaffSelection } from '@/features/abutters/types'
import { boardSettingsDefault } from '@/features/boards/boardSettings'
import { setActivePackForTest } from '@/features/packs/registry'
import '@/features/packs/registryAbutters'
import { importScenario, namesOf } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  maineBoardPack,
  publishMaineBuffer,
  submitMaineApplication,
} from '@/test/maineAbutterWorld'
import { ME_PACK } from '../index'
import { ME_ABUTTER_PARAMS } from './params'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  ids = await importScenario(handle.db, world.staff)
  setActivePackForTest(ME_PACK)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

function idOf(name: string): string {
  return new Map(Object.entries(ids)).get(name) ?? ''
}

async function distanceFt(from: string, to: string): Promise<number> {
  const result = await handle.db.execute<{ feet: number }>(sql`
    select ST_Distance(
      ST_Transform(a.geom, ${projectedSridParam()}),
      ST_Transform(b.geom, ${projectedSridParam()})
    )::float8 as feet
    from parcels a, parcels b
    where a.id = ${idOf(from)} and b.id = ${idOf(to)}
  `)
  return result.rows[0]?.feet ?? Number.NaN
}

async function select(
  bufferFt: number | null,
  staffSelections: StaffSelection[] = [],
): Promise<CandidateSelection> {
  return await handle.db.transaction((tx) =>
    abutterStrategy(ME_ABUTTER_PARAMS.key).select(
      tx,
      {
        applicationId: '00000000-0000-4000-8000-000000000000',
        applicantParcelIds: [ids.A ?? ''],
        staffSelections,
        crossingsAttested: false,
        settings: { ...boardSettingsDefault([]).abutters, projectionEnabled: false, bufferFt },
        now: NOW,
      },
      signal,
    ),
  )
}

function reasonsByName(selection: CandidateSelection): Record<string, string[]> {
  return Object.fromEntries(
    selection.candidates.map((c) => [
      namesOf(ids, [c.parcelId])[0] ?? c.parcelId,
      c.reasons.map((r) => r.kind),
    ]),
  )
}

describe('the Maine adjacent and buffer strategy', () => {
  it('lists only the parcels touching the property when the town sets no buffer', async () => {
    const selection = await select(null)
    expect(reasonsByName(selection)).toEqual({
      R: ['adjacent'],
      RD: ['adjacent'],
      SE: ['adjacent'],
      SW: ['adjacent'],
    })
    expect(selection.incomplete).toEqual([])
  })

  it('adds the nearer parcel inside the buffer and not the farther one', async () => {
    const near = await distanceFt('A', 'W2')
    const far = await distanceFt('A', 'N3')
    expect(near).toBeGreaterThan(ME_ABUTTER_PARAMS.adjacencyToleranceFt)
    expect(far).toBeGreaterThan(near)
    const bufferFt = (near + far) / 2
    const selection = await select(bufferFt)
    const reasons = reasonsByName(selection)
    expect(reasons.W2).toEqual(['within_buffer'])
    expect(reasons.N3).toBeUndefined()
    expect(reasons.A).toBeUndefined()
    expect(reasons.SW).toEqual(['adjacent', 'within_buffer'])
    const w2 = selection.candidates.find((c) => c.parcelId === ids.W2)
    expect(w2?.reasons).toEqual([{ kind: 'within_buffer', bufferFt }])
    expect(selection.incomplete).toEqual([])
  })

  it('never lists the applicant parcel, even when staff select it', async () => {
    const staff = (name: string): StaffSelection => ({
      parcelId: idOf(name),
      crossing: 'street',
      note: 'Across the road',
      by: 'Land Use Technician',
    })
    const selection = await select(null, [staff('A'), staff('N3')])
    const reasons = reasonsByName(selection)
    expect(reasons.A).toBeUndefined()
    expect(reasons.N3).toEqual(['staff_selected'])
  })
})

describe('a Maine list drawn with a town buffer', () => {
  const pack = maineBoardPack({ roles: ['applicant', 'abutter_owner'], conditionalRoles: [] })
  let applicationId: string

  beforeEach(async () => {
    setActivePackForTest(pack)
    applicationId = await submitMaineApplication(handle.db, world, pack, ids.A ?? '')
  })

  async function drawList(): Promise<string> {
    const made = await generateList(handle.db, world.staff, { applicationId }, signal, NOW)
    if (!made.ok) throw new Error(`generate failed: ${JSON.stringify(made.error)}`)
    return made.value.listId
  }

  it('issues without a crossing review and records the buffer in the snapshot', async () => {
    await publishMaineBuffer(handle.db, world, 300)
    const listId = await drawList()
    const issued = await issueList(handle.db, world.staff, { listId }, signal, NOW)
    if (!issued.ok) throw new Error(`issue failed: ${JSON.stringify(issued.error)}`)
    const stored = await currentIssuedList(handle.db, applicationId, signal)
    expect(stored?.snapshot.settings).toEqual({
      projectionEnabled: false,
      assumedRightOfWayFt: boardSettingsDefault([]).abutters.assumedRightOfWayFt,
      bufferFt: 300,
    })
    expect(stored?.snapshot.strategy.key).toBe('me.adjacent_buffer.v1')
    expect(stored?.snapshot.candidates.find((c) => c.parcelId === ids.W2)?.reasons).toEqual([
      { kind: 'within_buffer', bufferFt: 300 },
    ])
    expect(stored === null ? null : snapshotHash(stored.snapshot)).toBe(stored?.snapshotSha256)
  })

  it('draws only the buffer outline on the map with projection off', async () => {
    await publishMaineBuffer(handle.db, world, 300)
    const view = await loadListView(handle.db, world.staff, await drawList(), signal)
    const kinds = (view?.overlay?.features ?? [])
      .map((f) => f.properties.kind)
      .filter((k) => k !== 'label')
    expect(kinds).toEqual(['buffer'])
  })

  it('has no map overlay when the town sets no buffer', async () => {
    await publishMaineBuffer(handle.db, world, null)
    const view = await loadListView(handle.db, world.staff, await drawList(), signal)
    expect(view?.overlay).toBeNull()
  })
})
