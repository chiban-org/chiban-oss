import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adjacentParcels } from '@/features/abutters/adjacency'
import { applicantParcelIds, setApplicantParcels } from '@/features/abutters/applicantParcels'
import { selectAdjacency } from '@/features/abutters/baseSelection'
import { loadCrossingInputs } from '@/features/abutters/crossingInputs'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettingsSchema'
import { importScenario, namesOf } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  ids = await importScenario(handle.db, world.staff)
})
afterEach(async () => {
  await handle.drop()
})

const adjacent = (names: string[]) =>
  handle.db.transaction((tx) =>
    adjacentParcels(
      tx,
      names.map((n) => ids[n] ?? ''),
      1,
      signal,
    ),
  )

describe('adjacentParcels', () => {
  it('A is adjacent to SW across a 0.5 ft gap, SE, R, and RD, and not W2', async () => {
    const found = namesOf(ids, await adjacent(['A'])).sort()
    expect(found).toEqual(['R', 'RD', 'SE', 'SW'])
  })

  it('applicant parcels are never candidates', async () => {
    const found = namesOf(ids, await adjacent(['A', 'SE']))
    expect(found).not.toContain('A')
    expect(found).not.toContain('SE')
  })

  it('lot line adjustment with two applicant parcels unions them', async () => {
    const found = namesOf(ids, await adjacent(['A', 'SE'])).sort()
    expect(found).toEqual(['R', 'RD', 'SW'])
  })

  it('an empty applicant set selects nothing', async () => {
    expect(await adjacent([])).toEqual([])
  })

  it('a retired parcel is not a candidate', async () => {
    await handle.db.execute(sql`update parcels set status = 'retired' where id = ${ids.SW}`)
    expect(namesOf(ids, await adjacent(['A'])).sort()).toEqual(['R', 'RD', 'SE'])
  })
})

describe('selectAdjacency', () => {
  const run = (
    staffSelections: {
      parcelId: string
      crossing: 'street' | 'stream'
      note: string
      by: string
    }[],
  ) =>
    handle.db.transaction((tx) =>
      selectAdjacency(
        tx,
        {
          applicationId: 'unused',
          applicantParcelIds: [ids.A ?? ''],
          staffSelections,
          crossingsAttested: false,
          settings: BOARD_SETTINGS_DEFAULT.abutters,
          now: NOW,
        },
        1,
        signal,
      ),
    )

  it('staff selection appears first with its note', async () => {
    const selection = await run([
      {
        parcelId: ids.N3 ?? '',
        crossing: 'street',
        note: 'Across Osprey Point Road',
        by: world.staff.userId,
      },
    ])
    const first = selection.candidates[0]
    expect(first?.parcelId).toBe(ids.N3)
    expect(first?.reasons[0]).toMatchObject({
      kind: 'staff_selected',
      crossing: 'street',
      note: 'Across Osprey Point Road',
    })
    expect(
      namesOf(
        ids,
        selection.candidates.map((c) => c.parcelId),
      )
        .slice(1)
        .sort(),
    ).toEqual(['R', 'RD', 'SE', 'SW'])
  })

  it('a staff selected parcel that is also adjacent merges its reasons', async () => {
    const selection = await run([
      {
        parcelId: ids.SW ?? '',
        crossing: 'street',
        note: 'Confirmed in the field',
        by: world.staff.userId,
      },
    ])
    const sw = selection.candidates.find((c) => c.parcelId === ids.SW)
    expect(sw?.reasons.map((r) => r.kind)).toEqual(['staff_selected', 'adjacent'])
    expect(selection.candidates.filter((c) => c.parcelId === ids.SW)).toHaveLength(1)
  })

  it('missing parcel layer is parcel_layer_unavailable and selects nothing', async () => {
    await handle.db.execute(
      sql`update gis_layers set last_success_at = null, adapter = null where key = 'parcels'`,
    )
    await handle.db.execute(sql`update gis_layers set required = false where key = 'parcels'`)
    const selection = await run([])
    expect(selection.candidates).toEqual([])
    expect(selection.incomplete.map((i) => i.code)).toEqual(['parcel_layer_unavailable'])
  })
})

describe('applicant parcels', () => {
  it('the project parcel is an applicant parcel and more can be added', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    const initial = await applicantParcelIds(handle.db, applicationId, signal)
    expect(initial).toHaveLength(1)
    const set = await setApplicantParcels(
      handle.db,
      world.staff,
      { applicationId, parcelIds: [...initial, ids.SE ?? ''] },
      signal,
    )
    expect(set.ok).toBe(true)
    expect(await applicantParcelIds(handle.db, applicationId, signal)).toHaveLength(2)
  })

  it('a reviewer cannot change applicant parcels', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    expect(
      await setApplicantParcels(
        handle.db,
        world.reviewer,
        { applicationId, parcelIds: [ids.SE ?? ''] },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an application with no parcels is empty, not an error', async () => {
    expect(
      await applicantParcelIds(handle.db, '00000000-0000-4000-8000-000000000000', signal),
    ).toEqual([])
  })
})

describe('loadCrossingInputs', () => {
  it('crossing inputs come back in feet', async () => {
    const inputs = await handle.db.transaction((tx) =>
      loadCrossingInputs(tx, [ids.A ?? ''], 300, signal),
    )
    const ring = inputs.applicantRings[0] ?? []
    const xs = ring.map((p) => p[0])
    const ys = ring.map((p) => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(400, 1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(300, 1)
    expect(inputs.others.map((o) => o.parcelId)).not.toContain(ids.A)
    expect(inputs.features.map((f) => f.layer)).toContain('roads')
  })

  it('features within the radius only', async () => {
    const inputs = await handle.db.transaction((tx) =>
      loadCrossingInputs(tx, [ids.A ?? ''], 300, signal),
    )
    const names = inputs.features.map((f) => f.name)
    expect(names).toContain('Osprey Point Road')
    expect(names).not.toContain('Mink Brook')
  })
})
