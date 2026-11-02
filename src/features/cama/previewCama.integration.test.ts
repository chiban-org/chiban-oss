import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CAMA_COLUMNS, DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { previewCama, previewCamaFile } from '@/features/cama/previewCama'
import { camaCsv, camaLine, rowForLot } from '@/test/fixtureBuilders/camaFixture'
import { makeParcel, staffActor } from '@/test/parcels'
import { bytes, type CamaWorld, fixture, lotAt, setupCamaWorld } from '@/test/testHarness/cama'

const signal = new AbortController().signal
let world: CamaWorld

beforeEach(async () => {
  world = await setupCamaWorld()
})
afterEach(async () => {
  await world.handle.drop()
})

describe('previewCama', () => {
  it('returns the headers, the first ten rows, their composed ids and resolve status', async () => {
    const preview = await previewCama(
      world.handle.db,
      fixture('alder-pond-cama.csv'),
      DEFAULT_CAMA_MAPPING,
      signal,
    )
    if (!preview.ok) throw new Error('preview failed')
    expect(preview.value.headers).toEqual([...DEFAULT_CAMA_COLUMNS])
    expect(preview.value.rows).toHaveLength(10)
    expect(preview.value.totalRows).toBe(36)
    expect(preview.value.rows[0]).toMatchObject({
      line: 2,
      id: '007001000000000',
      status: 'resolves',
      ownerName: 'Larkspur Family Trust',
    })
  })

  it('marks unknown, retired and badly formed ids', async () => {
    await makeParcel(world.handle.db, [
      { format: 'cama15', value: '005001000000000', status: 'retired' },
    ])
    const text = camaCsv([
      camaLine({ ...rowForLot(lotAt(0)), gis12: '099001000000' }),
      camaLine({ ...rowForLot(lotAt(0)), gis12: '005001000000' }),
      '7,14000,0,0,Someone,,PO Box 1,,Alder Pond,NH,03999,12,Heron Cove Road',
    ])
    const preview = await previewCama(world.handle.db, bytes(text), DEFAULT_CAMA_MAPPING, signal)
    if (!preview.ok) throw new Error('preview failed')
    expect(preview.value.rows.map((r) => r.status)).toEqual(['unknown', 'retired', 'invalid'])
    expect(preview.value.rows[2]?.id).toBeNull()
  })

  it('still returns the headers when a mapped column is missing from the file', async () => {
    const preview = await previewCama(
      world.handle.db,
      bytes('parcel,holder\n7,Someone\n'),
      DEFAULT_CAMA_MAPPING,
      signal,
    )
    if (!preview.ok) throw new Error('preview failed')
    expect(preview.value.headers).toEqual(['parcel', 'holder'])
    expect(preview.value.rows[0]).toMatchObject({ id: null, status: 'invalid' })
  })

  it('is refused for a reviewer', async () => {
    const reviewer = await staffActor(world.handle.db, 'reviewer')
    const result = await previewCamaFile(
      world.handle.db,
      reviewer,
      { bytes: fixture('alder-pond-cama.csv'), mapping: DEFAULT_CAMA_MAPPING },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('rejects a mapping that does not parse', async () => {
    const result = await previewCamaFile(
      world.handle.db,
      world.staff,
      { bytes: fixture('alder-pond-cama.csv'), mapping: { id: 1 } },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'invalid_mapping' })
  })
})
