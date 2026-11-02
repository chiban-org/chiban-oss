import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gisLayers } from '@/db/schema'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedTown } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-01T15:00:00Z')
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedTown(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function setLayer(
  key: 'parcels' | 'roads',
  patch: Partial<typeof gisLayers.$inferInsert>,
): Promise<void> {
  await handle.db
    .update(gisLayers)
    .set({
      adapter: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      staleAfterDays: 90,
      ...patch,
    })
    .where(eq(gisLayers.key, key))
}

describe('getLayerStatus', () => {
  const cases: [string, Partial<typeof gisLayers.$inferInsert>, string][] = [
    ['never imported', {}, 'never_imported'],
    ['fresh', { lastSuccessAt: new Date('2027-02-01T15:00:00Z') }, 'fresh'],
    ['stale', { lastSuccessAt: new Date('2026-10-01T15:00:00Z') }, 'stale'],
    [
      'failed after success',
      {
        lastSuccessAt: new Date('2027-02-01T15:00:00Z'),
        lastFailureAt: new Date('2027-02-02T15:00:00Z'),
      },
      'import_failed',
    ],
    [
      'failed with no success',
      { lastFailureAt: new Date('2027-02-02T15:00:00Z') },
      'import_failed',
    ],
    [
      'success after failure and stale',
      {
        lastSuccessAt: new Date('2026-10-01T15:00:00Z'),
        lastFailureAt: new Date('2026-09-01T15:00:00Z'),
      },
      'stale',
    ],
  ]
  it.each(cases)('layer status precedence: %s', async (_name, patch, expected) => {
    await setLayer('parcels', patch)
    expect((await getLayerStatus(handle.db, 'parcels', NOW, signal)).state).toBe(expected)
  })

  it('stale boundary', async () => {
    await setLayer('parcels', { lastSuccessAt: new Date('2027-01-01T15:00:00Z') })
    const on = await getLayerStatus(handle.db, 'parcels', new Date('2027-04-01T15:00:00Z'), signal)
    const after = await getLayerStatus(
      handle.db,
      'parcels',
      new Date('2027-04-02T15:00:00Z'),
      signal,
    )
    expect(on.state).toBe('fresh')
    expect(on.ageDays).toBe(90)
    expect(after.state).toBe('stale')
  })

  it('roads with no adapter is not_configured', async () => {
    await setLayer('roads', {})
    expect((await getLayerStatus(handle.db, 'roads', NOW, signal)).state).toBe('not_configured')
  })
})
