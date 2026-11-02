import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import { createNhStrategy } from '@packs/nh/abutters/strategy'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterStrategy } from '@/features/abutters/registry'
import type { CandidateSelection, StaffSelection } from '@/features/abutters/types'
import {
  BOARD_SETTINGS_DEFAULT,
  type BoardSettingsBody,
} from '@/features/boards/boardSettingsSchema'
import { importScenario, type ScenarioOptions } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
const PROJECTION_ON: BoardSettingsBody['abutters'] = {
  ...BOARD_SETTINGS_DEFAULT.abutters,
  projectionEnabled: true,
  layersConfirmedBy: 'Land Use Technician',
  layersConfirmedOn: '2027-02-01' as CivilDate,
}
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function select(
  applicant: string[],
  options: {
    settings?: BoardSettingsBody['abutters']
    attested?: boolean
    staff?: StaffSelection[]
  } = {},
): Promise<CandidateSelection> {
  return await handle.db.transaction((tx) =>
    abutterStrategy('nh.abutters.adjacency_projection').select(
      tx,
      {
        applicationId: 'unused',
        applicantParcelIds: applicant.map((n) => ids[n] ?? ''),
        staffSelections: options.staff ?? [],
        crossingsAttested: options.attested ?? false,
        settings: options.settings ?? PROJECTION_ON,
        now: NOW,
      },
      signal,
    ),
  )
}

async function load(options?: ScenarioOptions) {
  ids = await importScenario(handle.db, world.staff, options)
}

const nameOf = (parcelId: string) =>
  Object.entries(ids).find(([, id]) => id === parcelId)?.[0] ?? parcelId
const names = (selection: CandidateSelection) =>
  selection.candidates.map((c) => nameOf(c.parcelId)).sort()
const codes = (selection: CandidateSelection) => selection.incomplete.map((i) => i.code)

describe('nh strategy with projection', () => {
  beforeEach(() => load())

  it('A with projection selects N1 at 49.5 ft, N2, N3, N4 and not N5 at 55 ft', async () => {
    const selection = await select(['A'])
    expect(names(selection)).toEqual(['N1', 'N2', 'N3', 'N4', 'R', 'RD', 'SE', 'SW'])
    expect(names(selection)).not.toContain('N5')
    expect(codes(selection)).toEqual([])
  })

  it('N3 carries only across_between_points', async () => {
    const selection = await select(['A'])
    const n3 = selection.candidates.find((c) => nameOf(c.parcelId) === 'N3')
    expect(n3?.reasons.map((r) => r.kind)).toEqual(['across_between_points'])
    expect(n3?.reasons[0]).toMatchObject({ featureName: 'Osprey Point Road' })
  })

  it('N1 is captured within 50 feet of the west projected point', async () => {
    const selection = await select(['A'])
    const n1 = selection.candidates.find((c) => nameOf(c.parcelId) === 'N1')
    expect(n1?.reasons.map((r) => r.kind)).toEqual(['across_within_capture'])
    const reason = n1?.reasons[0]
    expect(reason?.kind === 'across_within_capture' && reason.distanceFt).toBeCloseTo(49.5, 1)
  })

  it('adjacent and across reasons merge on one candidate', async () => {
    const wider = createNhStrategy({ ...NH_ABUTTER_PARAMS, captureRadiusFt: 51 })
    const selection = await handle.db.transaction((tx) =>
      wider.select(
        tx,
        {
          applicationId: 'unused',
          applicantParcelIds: [ids.A ?? ''],
          staffSelections: [],
          crossingsAttested: false,
          settings: PROJECTION_ON,
          now: NOW,
        },
        signal,
      ),
    )
    const se = selection.candidates.filter((c) => nameOf(c.parcelId) === 'SE')
    expect(se).toHaveLength(1)
    expect(se[0]?.reasons.map((r) => r.kind)).toEqual(['adjacent', 'across_within_capture'])
    expect(names(selection)).not.toContain('N5')
  })

  it('B selects E1 and E2 and not E3', async () => {
    const selection = await select(['B'])
    expect(names(selection)).toEqual(['E1', 'E2'])
    expect(codes(selection)).toEqual([])
  })

  it('K selects I1, I2, I3 and not I0 or I4', async () => {
    const selection = await select(['K'])
    expect(names(selection)).toEqual(['I1', 'I2', 'I3'])
  })

  it('Heron Pond flag makes the selection incomplete until attested', async () => {
    const open = await select(['P'])
    expect(codes(open)).toEqual(['crossing_too_wide', 'crossing_too_wide'])
    expect(open.incomplete[0]?.detail).toContain('Heron Pond')
    expect(codes(await select(['P'], { attested: true }))).toEqual([])
  })

  it('staff selections come first and survive projection', async () => {
    const selection = await select(['A'], {
      staff: [
        {
          parcelId: ids.N5 ?? '',
          crossing: 'street',
          note: 'Across the road',
          by: world.staff.userId,
        },
      ],
    })
    expect(nameOf(selection.candidates[0]?.parcelId ?? '')).toBe('N5')
    expect(names(selection)).toContain('N5')
  })

  it('the layers report the status of each import', async () => {
    const selection = await select(['A'])
    expect(selection.layers.roads.state).toBe('fresh')
    expect(selection.layers.water.state).toBe('fresh')
  })
})

describe('nh strategy without projection', () => {
  it('projection disabled lists adjacency only and projection_disabled', async () => {
    await load()
    const selection = await select(['A'], { settings: BOARD_SETTINGS_DEFAULT.abutters })
    expect(names(selection)).toEqual(['R', 'RD', 'SE', 'SW'])
    expect(codes(selection)).toEqual(['projection_disabled'])
  })

  it('projection disabled is cleared by attestation', async () => {
    await load()
    const selection = await select(['A'], {
      settings: BOARD_SETTINGS_DEFAULT.abutters,
      attested: true,
    })
    expect(codes(selection)).toEqual([])
  })

  it('missing roads layer makes the list incomplete until crossings are attested', async () => {
    await load({ roads: 'none' })
    const open = await select(['A'])
    expect(codes(open)).toEqual(['crossing_layers_unavailable'])
    expect(names(open)).toEqual(['R', 'RD', 'SE', 'SW'])
    expect(codes(await select(['A'], { attested: true }))).toEqual([])
  })

  it('failed water import is crossing_layers_unavailable', async () => {
    await load()
    await handle.db.execute(
      sql`update gis_layers set last_failure_at = last_success_at + interval '1 hour', last_error = 'timeout' where key = 'water'`,
    )
    const selection = await select(['B'])
    expect(codes(selection)).toEqual(['crossing_layers_unavailable'])
    expect(selection.layers.water.state).toBe('import_failed')
    expect(names(selection)).toEqual([])
  })

  it('centerline and right-of-way layers select the same parcels', async () => {
    await load({ roads: 'centerline' })
    const centerline = names(await select(['A']))
    const other = await makeTestDb()
    try {
      const otherWorld = await setupBoardWorld(other.db)
      ids = await importScenario(other.db, otherWorld.staff, { roads: 'row' })
      const row = names(
        await other.db.transaction((tx) =>
          abutterStrategy('nh.abutters.adjacency_projection').select(
            tx,
            {
              applicationId: 'unused',
              applicantParcelIds: [ids.A ?? ''],
              staffSelections: [],
              crossingsAttested: false,
              settings: PROJECTION_ON,
              now: NOW,
            },
            signal,
          ),
        ),
      )
      expect(row).toEqual(centerline)
    } finally {
      await other.drop()
    }
  })

  it('stream centerline selects the same parcels as the stream polygon', async () => {
    await load({ water: 'polygon' })
    const polygon = names(await select(['B']))
    const other = await makeTestDb()
    try {
      const otherWorld = await setupBoardWorld(other.db)
      ids = await importScenario(other.db, otherWorld.staff, { water: 'centerline' })
      const line = names(
        await other.db.transaction((tx) =>
          abutterStrategy('nh.abutters.adjacency_projection').select(
            tx,
            {
              applicationId: 'unused',
              applicantParcelIds: [ids.B ?? ''],
              staffSelections: [],
              crossingsAttested: false,
              settings: PROJECTION_ON,
              now: NOW,
            },
            signal,
          ),
        ),
      )
      expect(line).toEqual(polygon)
    } finally {
      await other.drop()
    }
  })
})
