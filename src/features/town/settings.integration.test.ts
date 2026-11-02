import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { townSettings } from '@/db/schema'
import { getTownSettings } from '@/features/town/settings'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
const signal = new AbortController().signal

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

describe('getTownSettings', () => {
  it('reports not_configured on an empty database', async () => {
    const result = await getTownSettings(handle.db, signal)
    expect(result).toEqual({ ok: false, error: 'not_configured' })
  })

  it('returns the single row after insert', async () => {
    await handle.db
      .insert(townSettings)
      .values({ name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' })
    const result = await getTownSettings(handle.db, signal)
    expect(result).toEqual({
      ok: true,
      value: { name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' },
    })
  })

  it('refuses a second row', async () => {
    await expect(
      handle.db.insert(townSettings).values({ id: 2, name: 'x', stateCode: 'NH', timeZone: 'UTC' }),
    ).rejects.toThrow()
  })
})
