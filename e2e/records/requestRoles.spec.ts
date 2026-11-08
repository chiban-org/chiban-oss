import { expect, test } from '../fixtures/test'

const LIST = '/staff/records/requests'
const SEEDED = 'Minutes and recordings of the last three Planning Board meetings'

for (const role of ['inspector', 'finance'] as const) {
  test.describe(`as ${role}`, () => {
    test.use({ role })

    test('cannot see the request log form and the list URL refuses', async ({ page }) => {
      await page.goto(LIST)
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'You do not have permission to see Right-to-Know requests.',
      )
      await expect(page.getByRole('button', { name: 'Log a request' })).toHaveCount(0)
      await expect(page.getByText(SEEDED)).toHaveCount(0)
    })

    test('a request page URL refuses and shows none of the request forms', async ({ page, db }) => {
      const row = await db.one<{ id: string }>(
        'select id from rtk_requests where description = $1',
        [SEEDED],
      )
      await page.goto(`${LIST}/${row.id}`)
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'You do not have permission to see Right-to-Know requests.',
      )
      await expect(page.getByText('Release the records now')).toHaveCount(0)
      await expect(page.getByText('More actions')).toHaveCount(0)
    })
  })
}
