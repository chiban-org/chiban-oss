import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configVersions } from '@/db/schema'
import { getBoardSettings } from '@/features/boards/boardSettings'
import { saveDraft } from '@/features/config/store'
import { parseRecheckDays, publishRecheckDays } from '@/features/rosters/recheckInterval'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('parseRecheckDays', () => {
  it('accepts whole numbers from 1 to 3650', () => {
    expect(parseRecheckDays('1')).toBe(1)
    expect(parseRecheckDays('180')).toBe(180)
    expect(parseRecheckDays('3650')).toBe(3650)
  })

  it('rejects zero, negatives, fractions, blanks and too large values', () => {
    for (const raw of ['0', '-5', '1.5', '', 'abc', '3651']) {
      expect(parseRecheckDays(raw)).toBeNull()
    }
  })
})

describe('publishRecheckDays', () => {
  it('publishes a new board settings version that changes only the interval', async () => {
    const before = await getBoardSettings(handle.db, signal)
    const result = await publishRecheckDays(handle.db, world.admin, 180, signal)
    expect(result.ok).toBe(true)
    const after = await getBoardSettings(handle.db, signal)
    expect(after.abutters.recheckContactsDays).toBe(180)
    expect({ ...after, abutters: { ...after.abutters, recheckContactsDays: 0 } }).toEqual({
      ...before,
      abutters: { ...before.abutters, recheckContactsDays: 0 },
    })
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.kind, 'board_settings'), eq(configVersions.status, 'published')))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.version).toBe(2)
  })

  it('refuses a value outside the range without publishing', async () => {
    const result = await publishRecheckDays(handle.db, world.admin, 0, signal)
    expect(result).toEqual({ ok: false, error: 'invalid_days' })
    const after = await getBoardSettings(handle.db, signal)
    expect(after.abutters.recheckContactsDays).toBe(365)
  })

  it('refuses a person without config.edit', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const result = await publishRecheckDays(handle.db, staff, 90, signal)
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('does not overwrite a pending board settings draft', async () => {
    const current = await getBoardSettings(handle.db, signal)
    await saveDraft(
      handle.db,
      world.admin,
      { kind: 'board_settings', key: 'default', body: current },
      signal,
    )
    const result = await publishRecheckDays(handle.db, world.admin, 90, signal)
    expect(result).toEqual({ ok: false, error: 'draft_pending' })
  })
})
