import { expect, test } from '../fixtures/test'
import { freshGisIds, parcelIdOfGis, pickParcel } from './parcelSupport'
import { expectRefusedBeside } from './refusal'
import { expectToast, openDetails } from './requestSupport'

test.use({ role: 'staff' })

test.describe('overriding a parcel ID', () => {
  test('refuses an ID in the wrong shape beside the value field and stores nothing', async ({
    page,
    db,
    suffix,
  }) => {
    const parcelId = await parcelIdOfGis(db, '007022000000')
    await page.goto(`/staff/parcels/${parcelId}`)
    await openDetails(page.locator('body'), 'Override an ID')
    await page.getByLabel('Format key').fill('gis12')
    const value = page.getByLabel('ID value')
    await value.fill('123')
    await page.getByLabel('Reason').fill(`Wrong shape, ${suffix}`)
    await page.getByRole('button', { name: 'Save override' }).click()
    await expectRefusedBeside(value, 'exactly 12 digits')
    const rows = await db.rows('select 1 from alias_overrides where reason = $1', [
      `Wrong shape, ${suffix}`,
    ])
    expect(rows).toHaveLength(0)
  })

  test('saves an override from the overrides page and lists it', async ({ page, db, suffix }) => {
    await page.goto('/staff/overrides/aliases')
    await page.getByRole('button', { name: 'Add override' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a parcel ID override' })
    await dialog.getByLabel('Format key').fill('cama15')
    await dialog.getByLabel('ID value').fill(`0070${freshGisIds(1)[0]?.slice(1)}`)
    await pickParcel(
      dialog.getByRole('combobox', { name: /^Points to parcel/ }),
      '12 Birch Hollow',
      '12 Birch Hollow Road',
    )
    await dialog.getByLabel('Reason').fill(`Old folder label ${suffix}`)
    await dialog.getByRole('button', { name: 'Save override' }).click()
    await expectToast(page, 'Override saved.')
    const rows = await db.rows('select 1 from alias_overrides where reason = $1', [
      `Old folder label ${suffix}`,
    ])
    expect(rows).toHaveLength(1)
  })
})
