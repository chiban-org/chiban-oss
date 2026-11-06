import { expect, type StaffRoleKey, test } from '../fixtures/test'

const REFUSED_PAGES: [string, string][] = [
  ['/staff/settings/fee_schedule', 'Settings'],
  ['/staff/settings/town-profile', 'Town profile'],
  ['/staff/admin/users', 'Users'],
  ['/staff/admin/users/invite', 'Users'],
]

const ROLES: StaffRoleKey[] = ['staff', 'finance', 'inspector']

for (const role of ROLES) {
  test.describe(`as ${role}`, () => {
    test.use({ role })

    test('has no Settings link and is refused on settings and user pages', async ({ page }) => {
      await page.goto('/staff')
      await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0)
      for (const [path] of REFUSED_PAGES) {
        await page.goto(path)
        await expect(
          page.getByRole('alert').filter({ hasText: 'You do not have permission to' }),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: /^(New |Publish|Send invite)/ })).toHaveCount(
          0,
        )
      }
    })
  })
}
