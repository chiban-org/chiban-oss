import { expect, fillDate, test } from '../fixtures/test'
import {
  addNewId,
  freshGisIds,
  parcelIdOfGis,
  pickParcel,
  recordSubdivision,
} from './parcelSupport'
import { expectRefusedBeside } from './refusal'

test.use({ role: 'staff' })

test.describe('recording a lineage event', () => {
  test('names the expected shape when a child ID is not a new ID in the right shape', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/parcels/lineage/new')
    await fillDate(page.getByLabel('Effective date'), '2026-10-01')
    await pickParcel(
      page.getByRole('combobox', { name: /^Parent parcels/ }),
      '22 Willow Bend',
      '22 Willow Bend',
    )
    await addNewId(page.getByRole('combobox', { name: /^Child parcels/ }), '12345')
    await page.getByRole('button', { name: 'Record lineage event' }).click()
    await expectRefusedBeside(
      page.getByRole('combobox', { name: /^Child parcels/ }),
      '12345 is not an existing parcel, and it is not a new parcel ID in the right shape. Map-lot ID: exactly 12 digits, counting leading zeros.',
    )
    const rows = await db.rows("select 1 from parcel_aliases where value = '12345'")
    expect(rows).toHaveLength(0)
  })

  test('records a subdivision, creating the new child parcels and retiring the parent', async ({
    page,
    db,
  }) => {
    const [first = '', second = ''] = freshGisIds(2)
    await recordSubdivision(page, { query: '22 Willow Bend', option: '22 Willow Bend' }, [
      first,
      second,
    ])
    const parent = await db.one<{ status: string }>(
      `select p.status from parcels p
       join parcel_aliases a on a.parcel_id = p.id
       where a.format = 'gis12' and a.value = '007024000000'`,
    )
    expect(parent.status).toBe('retired')
    expect(await parcelIdOfGis(db, first)).toMatch(/^[0-9a-f-]{36}$/)
    const event = await db.one<{ kind: string; effective_date: string }>(
      `select e.kind, e.effective_date::text from parcel_lineage_events e
       join parcel_lineage_links l on l.event_id = e.id
       where l.parcel_id = $1`,
      [await parcelIdOfGis(db, first)],
    )
    expect(event).toEqual({ kind: 'subdivision', effective_date: '2026-10-01' })
  })
})

test.describe('lineage as an inspector', () => {
  test.use({ role: 'inspector' })

  test('cannot see the lineage form and the URL refuses', async ({ page }) => {
    await page.goto('/staff/parcels/lineage/new')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to record lineage events.',
    )
    await expect(page.getByRole('button', { name: 'Record lineage event' })).toHaveCount(0)
  })
})
