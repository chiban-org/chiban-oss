import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPortalBoardRecord } from '@/features/portal/boardRecord'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { findIsoDates, findRawKeys, findUuids } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

describe('the applicant board record', () => {
  it('shows the hearing, its notice, the decision, and the rehearing deadline in words', async () => {
    const { store } = await makeTestStore()
    const made = await decidedZba(handle.db, world, store, { documents: false })
    const record = await loadPortalBoardRecord(
      handle.db,
      world.applicant,
      made.applicationId,
      signal,
    )
    if (!record.ok) throw new Error(record.error)
    const text = JSON.stringify(record.value)
    expect(record.value.hearings[0]).toMatch(
      /^Public hearing, Zoning Board of Adjustment, April 15, 2027 at /,
    )
    expect(record.value.hearings[0]).toContain('Held.')
    expect(record.value.hearings[0]).toContain('properly noticed')
    expect(record.value.decisions).toEqual(['Approved, voted April 15, 2027.'])
    expect(record.value.deadlines).toContainEqual(expect.stringContaining('due May 17, 2027'))
    expect(findIsoDates(text)).toEqual([])
    expect(findUuids(text)).toEqual([])
    expect(findRawKeys(text, ['public_hearing', 'approved', 'zba', 'held'])).toEqual([])
  })

  it('someone who is not a party sees nothing', async () => {
    const { store } = await makeTestStore()
    const made = await decidedZba(handle.db, world, store, { documents: false })
    const stranger = await staffActor(handle.db, 'reviewer')
    expect(await loadPortalBoardRecord(handle.db, stranger, made.applicationId, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
