import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationMunicipalities, applications, sourceWaterDeterminations } from '@/db/schema'
import { setApplicationMunicipalities } from '@/features/boards/applicationMunicipalities'
import { recordSourceWaterDetermination } from '@/features/boards/sourceWater'
import {
  ALDER_POND_CONTACTS,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let applicationId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  applicationId = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  await saveAndPublish(handle.db, world.admin, 'regional_contacts', 'default', {
    ...ALDER_POND_CONTACTS,
    waterSuppliers: [
      {
        key: 'lakeside_water',
        name: 'Lakeside Water District',
        mailingAddress: '2 Reservoir Road, Alder Pond NH 03999',
      },
    ],
  })
})
afterEach(async () => {
  await handle.drop()
})

describe('recordSourceWaterDetermination', () => {
  it('within with a supplier is stored with the date and the actor', async () => {
    const result = await recordSourceWaterDetermination(
      handle.db,
      world.staff,
      { applicationId, determination: 'within', supplierKey: 'lakeside_water' },
      signal,
      NOW,
    )
    expect(result.ok).toBe(true)
    const [row] = await handle.db.select().from(sourceWaterDeterminations)
    expect(row).toMatchObject({
      applicationId,
      determination: 'within',
      supplierKey: 'lakeside_water',
      determinedOn: '2027-03-24',
      determinedBy: world.staff.userId,
    })
  })

  it('within without a supplier is refused', async () => {
    expect(
      await recordSourceWaterDetermination(
        handle.db,
        world.staff,
        { applicationId, determination: 'within', supplierKey: null },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'supplier_required' })
    expect(await handle.db.select().from(sourceWaterDeterminations)).toHaveLength(0)
  })

  it('within with a supplier the town has not listed is refused', async () => {
    expect(
      await recordSourceWaterDetermination(
        handle.db,
        world.staff,
        { applicationId, determination: 'within', supplierKey: 'forged_supplier' },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'unknown_supplier' })
    expect(await handle.db.select().from(sourceWaterDeterminations)).toHaveLength(0)
  })

  it('not_within drops any supplier named', async () => {
    await recordSourceWaterDetermination(
      handle.db,
      world.staff,
      { applicationId, determination: 'not_within', supplierKey: 'lakeside_water' },
      signal,
      NOW,
    )
    const [row] = await handle.db.select().from(sourceWaterDeterminations)
    expect(row).toMatchObject({ determination: 'not_within', supplierKey: null })
  })

  it('recording again replaces the determination', async () => {
    for (const determination of ['not_within', 'within'] as const) {
      await recordSourceWaterDetermination(
        handle.db,
        world.staff,
        { applicationId, determination, supplierKey: 'lakeside_water' },
        signal,
        NOW,
      )
    }
    const rows = await handle.db.select().from(sourceWaterDeterminations)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.determination).toBe('within')
  })

  it('a reviewer without abutter rights is forbidden', async () => {
    expect(
      await recordSourceWaterDetermination(
        handle.db,
        world.reviewer,
        { applicationId, determination: 'not_within', supplierKey: null },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an unknown application is not found', async () => {
    expect(
      await recordSourceWaterDetermination(
        handle.db,
        world.staff,
        {
          applicationId: '00000000-0000-4000-8000-000000000001',
          determination: 'not_within',
          supplierKey: null,
        },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
  })

  it('a closed application is refused', async () => {
    await handle.db
      .update(applications)
      .set({ state: 'closed' })
      .where(eq(applications.id, applicationId))
    expect(
      await recordSourceWaterDetermination(
        handle.db,
        world.staff,
        { applicationId, determination: 'not_within', supplierKey: null },
        signal,
        NOW,
      ),
    ).toEqual({ ok: false, error: 'application_closed' })
  })
})

describe('setApplicationMunicipalities', () => {
  it('replaces the list with the municipalities given', async () => {
    await setApplicationMunicipalities(
      handle.db,
      world.staff,
      {
        applicationId,
        municipalities: [
          { key: 'pine_river', relation: 'abutting' },
          { key: 'dunmore', relation: 'includes' },
        ],
      },
      signal,
    )
    const second = await setApplicationMunicipalities(
      handle.db,
      world.staff,
      { applicationId, municipalities: [{ key: 'dunmore', relation: 'abutting' }] },
      signal,
    )
    expect(second.ok).toBe(true)
    const rows = await handle.db.select().from(applicationMunicipalities)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ municipalityKey: 'dunmore', relation: 'abutting' })
  })

  it('refuses a municipality the town has not listed and keeps the earlier list', async () => {
    await setApplicationMunicipalities(
      handle.db,
      world.staff,
      { applicationId, municipalities: [{ key: 'dunmore', relation: 'abutting' }] },
      signal,
    )
    expect(
      await setApplicationMunicipalities(
        handle.db,
        world.staff,
        {
          applicationId,
          municipalities: [
            { key: 'pine_river', relation: 'abutting' },
            { key: 'forged_town', relation: 'includes' },
          ],
        },
        signal,
      ),
    ).toEqual({ ok: false, error: 'unknown_municipality' })
    const rows = await handle.db.select().from(applicationMunicipalities)
    expect(rows.map((r) => r.municipalityKey)).toEqual(['dunmore'])
  })

  it('refuses a reviewer and a closed application', async () => {
    expect(
      await setApplicationMunicipalities(
        handle.db,
        world.reviewer,
        { applicationId, municipalities: [] },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    await handle.db
      .update(applications)
      .set({ state: 'closed' })
      .where(eq(applications.id, applicationId))
    expect(
      await setApplicationMunicipalities(
        handle.db,
        world.staff,
        { applicationId, municipalities: [] },
        signal,
      ),
    ).toEqual({ ok: false, error: 'application_closed' })
  })
})
