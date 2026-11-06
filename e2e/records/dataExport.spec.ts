import { activeBusinessExports, requestBusinessExport } from '../fixtures/exportRequest'
import { accountFor, expect, test } from '../fixtures/test'

test.describe('data export', () => {
  test.use({ role: 'records' })

  test('requests an export and lists it', async ({ page, db }) => {
    const outcome = await requestBusinessExport(page)
    const requester = await db.userIdFor(accountFor('records').email)
    const active = await activeBusinessExports(db)
    expect(active).toHaveLength(1)
    if (outcome === 'requested') expect(active[0]?.requested_by).toBe(requester)
    await page.reload()
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: /^Requested / })
        .first(),
    ).toBeVisible()
  })
})

test.describe('data export as the clerk', () => {
  test.use({ role: 'staff' })

  test('cannot request an export', async ({ page }) => {
    await page.goto('/staff/admin/export')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to export records.',
    )
    await expect(page.getByRole('button', { name: 'Request a new export' })).toHaveCount(0)
  })
})
