import { expect, test } from '../fixtures/test'

test.use({ role: 'admin' })

test.describe('starter templates on the demo town', () => {
  test('lists every starter as adopted, with nothing left to adopt or update', async ({ page }) => {
    await page.goto('/staff/settings/starters')
    await expect(page.getByText('Every starter has been adopted.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Adopt this starter' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Check adopted starters for updates' }).click()
    await expect(page).toHaveURL('/staff/settings/starters/updates')
    await expect(page.getByText('Every adopted starter is up to date.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply selected' })).toHaveCount(0)
  })
})
