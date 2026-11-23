import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getBuildingProgram } from '@/features/buildingProgram/settings'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

describe('getBuildingProgram', () => {
  it('defaults to permits on with the pack default code when nothing is published', async () => {
    expect(await getBuildingProgram(handle.db, signal)).toEqual({
      key: 'default',
      permitsEnabled: true,
      codeChoice: 'state_code',
      residents: null,
    })
  })
})
