import { accountFor, expect, test } from '../fixtures/test'
import { demoTitle, openApplication, visibleSummary } from './support'

const LODGE = demoTitle('Lodge with regional impact')

test.describe('choosing who is responsible for an application', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('assigns Sam Clerk as responsible and stores it', async ({ page, db }) => {
      const id = await openApplication(page, db, LODGE)
      await visibleSummary(page, /responsible/).click()
      await page
        .getByLabel('Responsible staff member')
        .filter({ visible: true })
        .selectOption({ label: 'Sam Clerk' })
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(
        page.getByRole('status').filter({ hasText: 'Responsible staff member saved.' }),
      ).toBeVisible()
      const row = await db.one<{ responsible_user_id: string | null }>(
        'select responsible_user_id from applications where id = $1',
        [id],
      )
      expect(row.responsible_user_id).toBe(await db.userIdFor(accountFor('staff').email))
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('sees who is responsible without a way to change it', async ({ page, db }) => {
      await openApplication(page, db, LODGE)
      await expect(
        page.getByRole('region', { name: 'Key facts' }).getByText('Responsible'),
      ).toBeVisible()
      await expect(page.getByLabel('Responsible staff member')).toHaveCount(0)
    })
  })
})
