import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from '../records/refusal'

test.use({ role: 'admin' })

test.describe('parcel ID formats in settings', () => {
  test('lists the two NH formats and shows which one parcels display', async ({ page }) => {
    await page.goto('/staff/settings/parcel-id-formats')
    await expect(page.getByRole('heading', { name: 'Parcel ID formats' })).toBeVisible()
    const mapLot = page.getByRole('row', { name: /Map-lot ID/ })
    await expect(mapLot).toContainText('Exactly 12 digits')
    await expect(mapLot).toContainText('Shown on parcels')
    await expect(page.getByRole('row', { name: /CAMA number/ })).toContainText('Exactly 15 digits')
  })

  test('refuses to narrow a format that parcels already use and says how many', async ({
    page,
  }) => {
    await page.goto('/staff/settings/parcel-id-formats')
    await page.getByRole('button', { name: 'Edit Map-lot ID' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Number of digits').fill('10')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expectRefusedBeside(
      dialog.getByLabel('Number of digits'),
      'already saved in this format would no longer fit',
    )
  })

  test('adds a format, then deletes it while nothing uses it', async ({ page, db }) => {
    await page.goto('/staff/settings/parcel-id-formats')
    await page.getByRole('button', { name: 'Add a format' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Short name').fill('town_pid')
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Town parcel ID')
    await dialog.getByLabel('Characters allowed').selectOption('free_text')
    await dialog.getByRole('button', { name: 'Add format' }).click()
    const row = page.getByRole('row', { name: /Town parcel ID/ })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Not used yet')
    await row.getByRole('button', { name: 'Delete Town parcel ID' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete format' }).click()
    await expect(page.getByRole('row', { name: /Town parcel ID/ })).toHaveCount(0)
    const left = await db.rows("select key from parcel_id_formats where key = 'town_pid'")
    expect(left).toHaveLength(0)
  })
})
