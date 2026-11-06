import { expect, test } from '../fixtures/test'

test.describe('public parcel search', () => {
  test('answers a search of only spaces with the two-character hint', async ({ page }) => {
    await page.goto('/parcels')
    await page.getByLabel('Find a parcel by ID, address, or owner').fill('   ')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByText('Enter at least two characters.')).toBeVisible()
    await expect(page.getByText('No parcels match that search.')).toHaveCount(0)
  })

  test('lists the parcel at a known address', async ({ page }) => {
    await page.goto('/parcels')
    await page.getByLabel('Find a parcel by ID, address, or owner').fill('12 Tamarack Way')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByText('12 Tamarack Way', { exact: true }).first()).toBeVisible()
  })
})
