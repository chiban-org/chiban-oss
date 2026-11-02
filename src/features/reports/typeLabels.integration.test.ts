import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applicationTypeLabels } from '@/features/reports/typeLabels'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('applicationTypeLabels', () => {
  it('maps a type key to its published label and falls back to the key for an unknown type', async () => {
    expect(world.projectId).not.toBe('')
    const labels = await applicationTypeLabels(handle.db, ['BP', 'ZZ'], signal)
    expect(labels.get('BP')).toBe('Building permit')
    expect(labels.get('ZZ')).toBe('ZZ')
  })
})
