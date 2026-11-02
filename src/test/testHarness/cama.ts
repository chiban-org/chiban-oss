import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { runCamaImport } from '@/features/cama/runCamaImport'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import { runImport } from '@/features/gis/import/runImport'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { makeTestDb, type TestDb } from '@/test/db'
import { buildLots, type GridLot } from '@/test/fixtureBuilders/alderPondGrid'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../fixtures/cama')
const signal = new AbortController().signal

const {
  ownerName: _owner,
  mailingAddress: _mailing,
  ...PARCEL_MAPPING_WITHOUT_OWNER
} = PARCEL_MAPPING

export { PARCEL_MAPPING_WITHOUT_OWNER }

export interface CamaWorld {
  handle: TestDb
  staff: Actor
}

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURE_DIR, name)))
}

export function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function lotAt(index: number): GridLot {
  const lot = buildLots().at(index)
  if (lot === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'No such fixture lot', { index })
  return lot
}

export async function setupCamaWorld(): Promise<CamaWorld> {
  const handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  const staff = await staffActor(handle.db, 'staff')
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING_WITHOUT_OWNER)
  const imported = await runImport(
    handle.db,
    { kind: 'user', userId: staff.userId },
    {
      layerKey: 'parcels',
      adapter: 'file_geojson',
      features: loadGeoJsonFixture('alder-pond-parcels.geojson'),
      fullLayer: true,
    },
    signal,
  )
  if (!imported.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'Parcels fixture import failed')
  const saved = await saveCamaMapping(handle.db, staff, DEFAULT_CAMA_MAPPING, signal)
  if (!saved.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'CAMA mapping not saved')
  return { handle, staff }
}

export async function runCama(world: CamaWorld, data: Uint8Array, fullLayer = true) {
  const result = await runCamaImport(
    world.handle.db,
    world.staff,
    { bytes: data, fullLayer },
    signal,
  )
  if (!result.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'CAMA import failed', { error: result.error })
  }
  return result.value
}

export async function parcelFor(world: CamaWorld, gis12: string) {
  const found = await resolveParcelId(world.handle.db, { format: 'gis12', value: gis12 }, signal)
  if (!found.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'No such parcel', { gis12 })
  const [row] = await world.handle.db
    .select()
    .from(parcels)
    .where(eq(parcels.id, found.value.parcelId))
  if (row === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'Parcel row missing', { gis12 })
  return row
}
