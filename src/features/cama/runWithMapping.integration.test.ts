import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gisLayers } from '@/db/schema'
import { type CamaMapping, DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { previewCama } from '@/features/cama/previewCama'
import { runCamaImport } from '@/features/cama/runCamaImport'
import { staffActor } from '@/test/parcels'
import { bytes, type CamaWorld, fixture, parcelFor, setupCamaWorld } from '@/test/testHarness/cama'

const signal = new AbortController().signal
let world: CamaWorld

const MAP_LOT_MAPPING: CamaMapping = {
  ...DEFAULT_CAMA_MAPPING,
  id: { format: 'gis12', parts: DEFAULT_CAMA_MAPPING.id.parts.slice(0, 4) },
}

function withUnitColumnFilled(): Uint8Array {
  const [header, ...rows] = new TextDecoder().decode(fixture('alder-pond-cama.csv')).split('\n')
  const filled = rows.map((row) => {
    if (row === '') return row
    const cells = row.split(',')
    cells[3] = '9'
    return cells.join(',')
  })
  return bytes([header, ...filled].join('\n'))
}

beforeEach(async () => {
  world = await setupCamaWorld()
})
afterEach(async () => {
  await world.handle.drop()
})

describe('runCamaImport with the mapping shown on screen', () => {
  it('applies the rows the preview matched when the mapping differs from the saved one', async () => {
    const preview = await previewCama(
      world.handle.db,
      withUnitColumnFilled(),
      MAP_LOT_MAPPING,
      signal,
    )
    if (!preview.ok) throw new Error('preview failed')
    expect(preview.value.rows.every((r) => r.status === 'resolves')).toBe(true)
    const run = await runCamaImport(
      world.handle.db,
      world.staff,
      { bytes: withUnitColumnFilled(), fullLayer: true, mapping: MAP_LOT_MAPPING },
      signal,
    )
    if (!run.ok) throw new Error(`run failed: ${JSON.stringify(run.error)}`)
    expect(run.value).toMatchObject({ countIn: 36, countApplied: 36, countExcepted: 0 })
    expect((await parcelFor(world, '007001000000')).ownerName).toBe('Larkspur Family Trust')
  })

  it('keeps the mapping it ran with as the saved mapping', async () => {
    await runCamaImport(
      world.handle.db,
      world.staff,
      { bytes: withUnitColumnFilled(), fullLayer: true, mapping: MAP_LOT_MAPPING },
      signal,
    )
    const [layer] = await world.handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
    expect(layer?.mapping).toEqual(MAP_LOT_MAPPING)
  })

  it('rejects an on-screen mapping that does not parse and runs nothing', async () => {
    const run = await runCamaImport(
      world.handle.db,
      world.staff,
      { bytes: withUnitColumnFilled(), fullLayer: true, mapping: { id: 1 } },
      signal,
    )
    expect(run).toEqual({ ok: false, error: 'invalid_mapping' })
    expect((await parcelFor(world, '007001000000')).ownerName).not.toBe('Larkspur Family Trust')
  })

  it('a reviewer passing a mapping is forbidden and the saved mapping stays', async () => {
    const reviewer = await staffActor(world.handle.db, 'reviewer')
    const run = await runCamaImport(
      world.handle.db,
      reviewer,
      { bytes: withUnitColumnFilled(), fullLayer: true, mapping: MAP_LOT_MAPPING },
      signal,
    )
    expect(run).toEqual({ ok: false, error: 'forbidden' })
    const [layer] = await world.handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
    expect(layer?.mapping).toEqual(DEFAULT_CAMA_MAPPING)
  })
})
