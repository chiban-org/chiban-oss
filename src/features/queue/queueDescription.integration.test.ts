import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listWorkQueue } from '@/features/queue/workQueue'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
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

async function descriptionOf(values: Record<string, string>): Promise<string | undefined> {
  const app = await makeApplication(handle.db, world, { values, state: 'submitted' } as never)
  const page = await listWorkQueue(handle.db, world.staff, { filters: {}, limit: 50 }, signal)
  return page.rows.find((r) => r.applicationId === app.applicationId)?.description
}

describe('work queue description', () => {
  it('reads the description answer, then the project description answer, then nothing', async () => {
    expect(await descriptionOf({ description: ' Build a rear deck. ' })).toBe('Build a rear deck.')
    expect(await descriptionOf({ project_description: 'Replace the roof.' })).toBe(
      'Replace the roof.',
    )
    expect(await descriptionOf({})).toBe('')
  })
})
