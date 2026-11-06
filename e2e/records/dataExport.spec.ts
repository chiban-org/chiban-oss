import { accountFor, expect, test } from '../fixtures/test'
import { expectToast } from './requestSupport'

test.describe('data export', () => {
  test.use({ role: 'records' })

  test('requests an export and lists it', async ({ page, db }) => {
    await page.goto('/staff/admin/export')
    await page.getByRole('button', { name: 'Request a new export' }).click()
    await expectToast(
      page,
      'Export requested. It is ready in a few minutes. Reload this page to see it.',
    )
    const requester = await db.userIdFor(accountFor('records').email)
    const rows = await db.rows<{ status: string }>(
      'select status from exports where requested_by = $1',
      [requester],
    )
    expect(rows).toHaveLength(1)
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
