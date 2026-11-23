import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadCaseDetail } from '@/features/enforcement/caseDetail'
import { openCase } from '@/features/enforcement/cases'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-02-26' as CivilDate
let handle: TestDb
let world: EnforcementWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function detailFor(input: { parcelId?: string; locationText: string }) {
  const opened = await openCase(handle.db, world.staff, input, signal, FIXTURE_NOW)
  if (!opened.ok) throw new Error(`open failed: ${opened.error}`)
  const detail = await loadCaseDetail(handle.db, world.staff, opened.value.caseId, TODAY, signal)
  if (!detail.ok) throw new Error('no detail')
  return detail.value
}

describe('case detail parcel owner', () => {
  it('returns the owner of the parcel the case is on', async () => {
    const parcelId = await makeParcel(handle.db, [], {
      ownerName: 'Odile Varnum',
      mailingAddress: '8 Quarry Lane, Fernhollow',
    })
    const detail = await detailFor({ parcelId, locationText: '8 Quarry Lane' })
    expect(detail.parcelOwner).toEqual({
      name: 'Odile Varnum',
      mailingAddress: '8 Quarry Lane, Fernhollow',
    })
  })

  it('returns no owner fields the parcel does not have', async () => {
    const parcelId = await makeParcel(handle.db, [])
    const detail = await detailFor({ parcelId, locationText: '3 Mill Road' })
    expect(detail.parcelOwner).toEqual({ name: null, mailingAddress: null })
  })

  it('returns null for a case with no parcel', async () => {
    const detail = await detailFor({ locationText: 'Behind the old mill' })
    expect(detail.parcelOwner).toBeNull()
  })
})
