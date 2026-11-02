import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setApplicantParcels } from '@/features/abutters/applicantParcels'
import { recordDesDetermination, suggestDesProximity } from '@/features/boards/des500'
import { importScenario } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function applicationOn(parcel: string) {
  const applicationId = await submitBoardApplication(
    handle.db,
    world,
    world.pbTypeKey,
    '2027-03-24',
  )
  const set = await setApplicantParcels(
    handle.db,
    world.staff,
    { applicationId, parcelIds: [ids[parcel] ?? ''] },
    signal,
  )
  expect(set.ok).toBe(true)
  return applicationId
}

describe('suggestDesProximity', () => {
  beforeEach(async () => {
    ids = await importScenario(handle.db, world.staff)
  })

  it('parcel 400 ft from Mink Brook suggests within 500 ft', async () => {
    const id = await applicationOn('M4')
    const suggestion = await suggestDesProximity(handle.db, id, NOW, signal)
    expect(suggestion.state).toBe('known')
    if (suggestion.state === 'known') {
      expect(suggestion.value.within).toBe(true)
      expect(suggestion.value.withinFt).toBeCloseTo(400, 0)
    }
  })

  it('parcel 650 ft away suggests not within', async () => {
    const id = await applicationOn('M6')
    const suggestion = await suggestDesProximity(handle.db, id, NOW, signal)
    expect(suggestion.state).toBe('known')
    if (suggestion.state === 'known') {
      expect(suggestion.value.within).toBe(false)
      expect(suggestion.value.withinFt).toBeCloseTo(650, 0)
    }
  })

  it('the nearer of two applicant parcels decides', async () => {
    const id = await applicationOn('M6')
    await setApplicantParcels(
      handle.db,
      world.staff,
      { applicationId: id, parcelIds: [ids.M6 ?? '', ids.M4 ?? ''] },
      signal,
    )
    const suggestion = await suggestDesProximity(handle.db, id, NOW, signal)
    expect(suggestion.state === 'known' && suggestion.value.within).toBe(true)
  })
})

describe('without a water layer', () => {
  it('no water layer suggests unknown', async () => {
    ids = await importScenario(handle.db, world.staff, { water: 'none' })
    const id = await applicationOn('M4')
    expect(await suggestDesProximity(handle.db, id, NOW, signal)).toEqual({ state: 'unknown' })
  })
})

describe('recordDesDetermination', () => {
  beforeEach(async () => {
    ids = await importScenario(handle.db, world.staff)
  })

  it('not_within against a within suggestion needs a reason', async () => {
    const id = await applicationOn('M4')
    expect(
      await recordDesDetermination(
        handle.db,
        world.staff,
        { applicationId: id, determination: 'not_within', reason: 'short' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'reason_required' })
    expect(
      (
        await recordDesDetermination(
          handle.db,
          world.staff,
          {
            applicationId: id,
            determination: 'not_within',
            reason: 'The building site is across the ridge, 700 feet from the brook',
          },
          signal,
          NOW,
        )
      ).ok,
    ).toBe(true)
  })

  it('within_500ft needs no reason when the suggestion agrees', async () => {
    const id = await applicationOn('M4')
    const result = await recordDesDetermination(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'within_500ft', reason: '' },
      signal,
      NOW,
    )
    expect(result.ok).toBe(true)
    const [row] = await handle.db.query.desProximityDeterminations.findMany()
    expect(row).toMatchObject({ determination: 'within_500ft', determinedOn: '2027-03-24' })
    expect(row?.suggested).toMatchObject({ state: 'known' })
  })

  it('not_applicable always needs a reason', async () => {
    const id = await applicationOn('M6')
    expect(
      await recordDesDetermination(
        handle.db,
        world.staff,
        { applicationId: id, determination: 'not_applicable', reason: '' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'reason_required' })
  })

  it('not_within with an unknown suggestion needs a reason', async () => {
    const fresh = await makeTestDb()
    try {
      const freshWorld = await setupBoardWorld(fresh.db)
      const freshIds = await importScenario(fresh.db, freshWorld.staff, { water: 'none' })
      const id = await submitBoardApplication(
        fresh.db,
        freshWorld,
        freshWorld.pbTypeKey,
        '2027-03-24',
      )
      await setApplicantParcels(
        fresh.db,
        freshWorld.staff,
        { applicationId: id, parcelIds: [freshIds.M6 ?? ''] },
        signal,
      )
      expect(
        await recordDesDetermination(
          fresh.db,
          freshWorld.staff,
          { applicationId: id, determination: 'not_within', reason: '' },
          signal,
          NOW,
        ),
      ).toEqual({ ok: false, error: 'reason_required' })
    } finally {
      await fresh.drop()
    }
  })

  it('a reviewer cannot record the determination', async () => {
    const id = await applicationOn('M4')
    expect(
      await recordDesDetermination(
        handle.db,
        world.reviewer,
        { applicationId: id, determination: 'within_500ft', reason: '' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('recording again replaces the determination', async () => {
    const id = await applicationOn('M4')
    for (const determination of ['within_500ft', 'within_500ft'] as const) {
      await recordDesDetermination(
        handle.db,
        world.staff,
        { applicationId: id, determination, reason: '' },
        signal,
        NOW,
      )
    }
    expect(await handle.db.query.desProximityDeterminations.findMany()).toHaveLength(1)
  })
})
