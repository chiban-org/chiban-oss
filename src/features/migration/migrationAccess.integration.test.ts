import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrationBatches } from '@/db/schema'
import { createUploadIntent } from '@/features/documents/uploads'
import { publishMigrationBatch } from '@/features/migration/publishBatch'
import { runBatch } from '@/features/migration/runBatch'
import { scanSource } from '@/features/migration/scanSource'
import { makeTestDb, type TestDb } from '@/test/db'
import { SERIES_KEY } from '@/test/migrationFixtures'
import {
  buildMigrationWorld,
  type MigrationWorld,
  scanInput,
  signal,
  WORLD_TIMEOUT_MS,
} from '@/test/migrationWorld'
import { staffActor } from '@/test/parcels'

let handle: TestDb
let world: MigrationWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await buildMigrationWorld(handle)
}, WORLD_TIMEOUT_MS)

afterAll(async () => {
  await handle.drop()
})

describe('migration access', () => {
  it('a reviewer and an applicant cannot scan, run, or publish', async () => {
    const before = await world.db.select().from(migrationBatches)
    for (const actor of [world.reviewer, world.applicant]) {
      expect(await scanSource(world.db, actor, scanInput(world.root), signal)).toEqual({
        ok: false,
        error: 'forbidden',
      })
      expect(
        await runBatch(world.db, world.store, world.converter, actor, world.batchId, signal),
      ).toEqual({ ok: false, error: 'forbidden' })
      expect(await publishMigrationBatch(world.db, actor, world.batchId, signal)).toEqual({
        ok: false,
        error: 'forbidden',
      })
    }
    expect(await world.db.select().from(migrationBatches)).toHaveLength(before.length)
  })

  it('an actor holding neither document.manage nor parcel.manage cannot scan', async () => {
    const inspector = await staffActor(world.db, 'inspector')
    expect(await scanSource(world.db, inspector, scanInput(world.root), signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('the portal uploader still refuses a tiff', async () => {
    const refused = await createUploadIntent(
      world.db,
      world.store,
      world.publisher,
      {
        target: { kind: 'parcel', id: world.parcel14 },
        title: 'Scan',
        filename: 'scan.tiff',
        contentType: 'image/tiff',
        sizeBytes: 1000,
        seriesKey: SERIES_KEY,
      },
      signal,
    )
    expect(refused).toEqual({ ok: false, error: 'type_not_allowed' })
  })

  it('scan rejects a bad pattern, series, id format, or folder', async () => {
    const base = scanInput(world.root)
    const cases = [
      [{ ...base, folderPattern: 'Map' }, 'invalid_pattern'],
      [{ ...base, seriesKey: 'nh.rs.nothing' }, 'unknown_series'],
      [{ ...base, idFormat: 'nope' }, 'unknown_format'],
      [{ ...base, root: path.join(world.root, 'absent') }, 'source_unreadable'],
    ] as const
    for (const [input, error] of cases) {
      expect(await scanSource(world.db, world.importer, input, signal)).toEqual({
        ok: false,
        error,
      })
    }
  })
})
