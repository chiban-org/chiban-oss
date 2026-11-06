import { expect, test } from '../fixtures/test'
import { expectToast } from './requestSupport'

test.describe('retrying preservation', () => {
  test.use({ role: 'records' })

  test('moves a document with no archival copy to the waiting list', async ({ page }) => {
    await page.goto('/staff/records/preservation')
    const row = page.getByRole('row').filter({ hasText: 'locked.pdf' })
    await row.getByRole('button', { name: 'Retry' }).click()
    await expectToast(page, 'Preservation will be tried again within a minute.')
    await page.goto('/staff/records/preservation')
    await expect(page.getByRole('row').filter({ hasText: 'locked.pdf' })).toHaveCount(0)
    await expect(
      page.getByRole('listitem').filter({ hasText: 'locked.pdf (tried 1 time so far)' }),
    ).toBeVisible()
  })
})

test.describe('preservation as a finance user', () => {
  test.use({ role: 'finance' })

  test('is refused the queue', async ({ page }) => {
    await page.goto('/staff/records/preservation')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to see the preservation queue.',
    )
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  })
})
