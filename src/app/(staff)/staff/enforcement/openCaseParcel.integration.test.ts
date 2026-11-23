import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementCases } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import { useEnforcementClock } from '@/test/enforcementCases'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeParcel } from '@/test/parcels'
import { actionHarness, redirectsTo, settle } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
useEnforcementClock()
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const BOTH_BLANK = 'Enter where the property is, or pick a parcel.'

async function caseOn(parcelId: string) {
  const [row] = await h.db
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.parcelId, parcelId))
  return row
}

describe('opening a case from a picked parcel with no location', () => {
  it('uses the parcel site address as the location', async () => {
    const parcelId = await makeParcel(h.db, [{ format: 'gis12', value: '051001000000' }], {
      siteAddress: '17 Fernhollow Road',
    })
    h.signIn(world.staff)
    const result = await settle(
      actions.openCaseAction(h.form({ locationText: '', parcelRef: '051001000000' })),
    )
    const row = await caseOn(parcelId)
    expect(result).toEqual(redirectsTo(`/staff/enforcement/${row?.id}`))
    expect(row?.locationText).toBe('17 Fernhollow Road')
  })

  it('refuses beside the location when neither a location nor a parcel is given', async () => {
    h.signIn(world.staff)
    const { value, written } = await h.recordWrites(() =>
      settle(actions.openCaseAction(h.form({ locationText: '   ', parcelRef: '' }))),
    )
    expect({ value, written }).toEqual({
      value: refuseField('locationText', BOTH_BLANK),
      written: [],
    })
  })

  it('uses the parcel display ID when the parcel has no site address', async () => {
    const parcelId = await makeParcel(h.db, [{ format: 'gis12', value: '051002000000' }])
    h.signIn(world.staff)
    const result = await settle(
      actions.openCaseAction(h.form({ locationText: '', parcelRef: '051002000000' })),
    )
    const row = await caseOn(parcelId)
    expect(result).toEqual(redirectsTo(`/staff/enforcement/${row?.id}`))
    expect(row?.locationText).toBe('051002000000')
  })

  it('refuses beside the location when the parcel has neither a site address nor a display ID', async () => {
    const parcelId = await makeParcel(h.db, [])
    h.signIn(world.staff)
    const { value, written } = await h.recordWrites(() =>
      settle(actions.openCaseAction(h.form({ locationText: '', parcelRef: parcelId }))),
    )
    expect({ value, written }).toEqual({
      value: refuseField('locationText', BOTH_BLANK),
      written: [],
    })
  })
})

describe('entering a complaint for a picked parcel with no location', () => {
  it('uses the parcel site address as the location', async () => {
    const parcelId = await makeParcel(h.db, [{ format: 'gis12', value: '051003000000' }], {
      siteAddress: '23 Alder Pond Lane',
    })
    h.signIn(world.staff)
    const result = await settle(
      actions.staffComplaintAction(
        h.form({
          locationText: '',
          parcelRef: '051003000000',
          description: 'A boat shed is going up at the waterline.',
        }),
      ),
    )
    const row = await caseOn(parcelId)
    expect(result).toEqual(redirectsTo(`/staff/enforcement/${row?.id}`))
    expect(row?.locationText).toBe('23 Alder Pond Lane')
  })

  it('refuses beside the location when neither is given', async () => {
    h.signIn(world.staff)
    const result = await settle(
      actions.staffComplaintAction(
        h.form({ locationText: '', parcelRef: '', description: 'Noise at night.' }),
      ),
    )
    expect(result).toEqual(refuseField('locationText', BOTH_BLANK))
  })
})
