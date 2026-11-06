import { expect, test } from '../fixtures/test'

test.use({ role: 'admin' })

test.describe('anonymous intake administration', () => {
  test('cannot be turned on without a passing retention check', async ({ page, db }) => {
    await page.goto('/staff/admin/anonymous-intake')
    const enable = page.getByRole('button', { name: 'Turn anonymous intake on' })
    await expect(enable).toBeDisabled()
    await expect(enable).toHaveAttribute('aria-describedby', 'intake-blocked')
    await expect(page.locator('#intake-blocked')).toContainText(
      'no passing retention check, so intake cannot be turned on',
    )
    const settings = await db.one<{ anonymous_intake_enabled: boolean }>(
      'select anonymous_intake_enabled from town_settings where id = 1',
    )
    expect(settings.anonymous_intake_enabled).toBe(false)
  })
})
