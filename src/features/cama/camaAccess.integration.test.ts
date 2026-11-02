import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { runCamaImport } from '@/features/cama/runCamaImport'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import { updateLayerSettings } from '@/features/gis/layerSettings'
import { PARCEL_MAPPING } from '@/test/gisFixtures'
import { staffActor } from '@/test/parcels'
import {
  bytes,
  type CamaWorld,
  fixture,
  PARCEL_MAPPING_WITHOUT_OWNER,
  parcelFor,
  setupCamaWorld,
} from '@/test/testHarness/cama'

const signal = new AbortController().signal
let world: CamaWorld

beforeEach(async () => {
  world = await setupCamaWorld()
})
afterEach(async () => {
  await world.handle.drop()
})

function parcelSettings(mapping: object) {
  return {
    key: 'parcels' as const,
    adapter: null,
    sourceUrl: null,
    mapping: JSON.stringify(mapping),
    staleAfterDays: 90,
    refreshIntervalHours: 24,
  }
}

describe('CAMA owns the owner data', () => {
  it('parcels mapping with ownerName while cama is configured is owner_source_conflict', async () => {
    const admin = await staffActor(world.handle.db, 'admin')
    const result = await updateLayerSettings(
      world.handle.db,
      admin,
      parcelSettings(PARCEL_MAPPING),
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'owner_source_conflict' })
  })

  it('a parcels mapping without owner fields still saves while cama is configured', async () => {
    const admin = await staffActor(world.handle.db, 'admin')
    const result = await updateLayerSettings(
      world.handle.db,
      admin,
      parcelSettings(PARCEL_MAPPING_WITHOUT_OWNER),
      signal,
    )
    expect(result.ok).toBe(true)
  })
})

describe('CAMA authorization', () => {
  it('applicant running the import is forbidden', async () => {
    const applicant = await staffActor(world.handle.db, 'applicant')
    const result = await runCamaImport(
      world.handle.db,
      applicant,
      { bytes: fixture('alder-pond-cama.csv'), fullLayer: true },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect((await parcelFor(world, '007001000000')).ownerName).toBeNull()
  })

  it('a reviewer can neither import nor save the mapping', async () => {
    const reviewer = await staffActor(world.handle.db, 'reviewer')
    const run = await runCamaImport(
      world.handle.db,
      reviewer,
      { bytes: fixture('alder-pond-cama.csv'), fullLayer: true },
      signal,
    )
    expect(run).toEqual({ ok: false, error: 'forbidden' })
    const save = await saveCamaMapping(world.handle.db, reviewer, DEFAULT_CAMA_MAPPING, signal)
    expect(save).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an applicant cannot save the mapping', async () => {
    const applicant = await staffActor(world.handle.db, 'applicant')
    const save = await saveCamaMapping(world.handle.db, applicant, DEFAULT_CAMA_MAPPING, signal)
    expect(save).toEqual({ ok: false, error: 'forbidden' })
  })

  it('saving a mapping that does not parse is invalid_mapping', async () => {
    const save = await saveCamaMapping(world.handle.db, world.staff, { id: 1 }, signal)
    expect(save).toEqual({ ok: false, error: 'invalid_mapping' })
  })

  it('a file missing a mapped column is reported as malformed and imports nothing', async () => {
    const result = await runCamaImport(
      world.handle.db,
      world.staff,
      { bytes: bytes('map,lot\n7,14\n'), fullLayer: true },
      signal,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatchObject({ kind: 'malformed' })
  })
})
