import { DEMO_REFUSAL, demoNoticeFor } from '@/features/demo/demoCopy'
import { expect, test } from '../fixtures/test'
import { DEMO_RESET_AT } from './demoSettings'

const BANNER = demoNoticeFor(DEMO_RESET_AT)

test.describe('public demo', () => {
  test('a visitor picks two roles in turn and sees the demo banner each time', async ({ page }) => {
    await page.goto('/staff/sign-in')
    await expect(page.getByRole('note').filter({ hasText: BANNER })).toBeVisible()
    await page.getByRole('link', { name: 'Try the demo without an account' }).click()
    await expect(page).toHaveURL(/\/demo$/)
    await expect(page.getByRole('heading', { name: 'Clerk at the counter' })).toBeVisible()

    await page.getByRole('button', { name: 'Continue as Sam Clerk' }).click()
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('note').filter({ hasText: BANNER })).toBeVisible()

    await page.goto('/sign-in')
    await page.getByRole('link', { name: 'Try the demo without an account' }).click()
    await page.getByRole('button', { name: 'Continue as Robin Vale' }).click()
    await expect(page).toHaveURL(/\/board$/)
    await expect(page.getByRole('note').filter({ hasText: BANNER })).toBeVisible()
    await page.goto('/staff')
    await expect(page).toHaveURL(/\/staff\/sign-in$/)
  })

  test('the administrator can add a parcel ID format but not delete one', async ({ page, db }) => {
    await page.goto('/demo')
    await page.getByRole('button', { name: 'Continue as Avery Admin' }).click()
    await expect(page).toHaveURL(/\/staff$/)
    await page.goto('/staff/settings/parcel-id-formats')
    await page.getByRole('button', { name: 'Add a format' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Short name').fill('demo_pid')
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Demo parcel ID')
    await dialog.getByLabel('Characters allowed').selectOption('free_text')
    await dialog.getByRole('button', { name: 'Add format' }).click()
    const row = page.getByRole('row', { name: /Demo parcel ID/ })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Delete Demo parcel ID' }).click()
    await expect(row.getByText(DEMO_REFUSAL)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const left = await db.rows("select key from parcel_id_formats where key = 'demo_pid'")
    expect(left).toHaveLength(1)
  })

  test('the dev sign-in page stays closed in a production demo', async ({ page }) => {
    const response = await page.goto('/dev/sign-in')
    expect(response?.status()).toBe(404)
  })
})
