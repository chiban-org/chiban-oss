import { expect, test } from '../fixtures/test'

test.describe('the Inspections entry in the staff navigation', () => {
  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('opens their own day, with no second entry for it', async ({ page }) => {
      await page.goto('/staff')
      const nav = page.getByRole('navigation').first()
      await nav.getByRole('link', { name: 'Inspections', exact: true }).first().click()
      await expect(page).toHaveURL(/\/staff\/inspections\/day$/)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/day|,\s\d{4}/i)
      await expect(nav.getByRole('link', { name: 'My day', exact: true })).toHaveCount(0)
    })
  })

  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('keeps the board and names the day list Inspector days', async ({ page }) => {
      await page.goto('/staff')
      const nav = page.getByRole('navigation').first()
      await nav.getByRole('link', { name: 'Inspections', exact: true }).first().click()
      await expect(page).toHaveURL(/\/staff\/inspections$/)
      await expect(page.getByRole('region', { name: 'Open slots' })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'Inspector days', exact: true })).toBeVisible()
    })

    test('lists the results owed across inspectors from the board', async ({ page }) => {
      await page.goto('/staff/inspections/owed')
      await expect(page.getByRole('heading', { level: 1, name: 'Results owed' })).toBeVisible()
    })
  })
})
