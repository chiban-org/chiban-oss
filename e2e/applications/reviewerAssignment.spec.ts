import { expect, test } from '../fixtures/test'
import { demoTitle, doThisNow, expectConfirmation, openApplication } from './support'

const MUDROOM = demoTitle('Mudroom addition due this week')

test.describe('assigning reviewers to an application', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('assigns a reviewer, stores the assignment, and removes it only after confirming', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, MUDROOM)
      const card = doThisNow(page)
      await expect(card).toContainText('Assign a reviewer')
      await card.getByLabel('Reviewer', { exact: true }).selectOption({ label: 'Remy Reviewer' })
      await card.getByRole('button', { name: 'Assign reviewer' }).click()
      const reviewers = page.getByRole('region', { name: 'Reviewers' })

      await expectConfirmation(page, 'Reviewer assigned.')
      await expect(
        reviewers.getByRole('listitem').filter({ hasText: 'Remy Reviewer, ' }),
      ).toHaveCount(1)
      const assigned = await db.one<{ count: string }>(
        `select count(*) from review_assignments ra join users u on u.id = ra.reviewer_user_id
          where ra.application_id = $1 and u.display_name = 'Remy Reviewer' and ra.removed_at is null`,
        [id],
      )
      expect(Number(assigned.count)).toBe(1)

      await reviewers.getByText('Remove', { exact: true }).click()
      await reviewers.getByRole('button', { name: 'Remove Remy Reviewer' }).click()
      const dialog = page.getByRole('dialog', { name: 'Remove Remy Reviewer?' })
      await expect(dialog).toContainText('Remy Reviewer will no longer see this application.')
      await dialog.getByRole('button', { name: 'Remove the reviewer' }).click()

      await expect(
        reviewers.getByRole('listitem').filter({ hasText: 'Remy Reviewer, ' }),
      ).toHaveCount(0)
      await expect
        .poll(async () => {
          const left = await db.one<{ count: string }>(
            `select count(*) from review_assignments ra join users u on u.id = ra.reviewer_user_id
          where ra.application_id = $1 and u.display_name = 'Remy Reviewer' and ra.removed_at is null`,
            [id],
          )
          return Number(left.count)
        })
        .toBe(0)
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered reviewer assignment', async ({ page, db }) => {
      await openApplication(page, db, MUDROOM)
      await expect(page.getByRole('button', { name: 'Assign reviewer' })).toHaveCount(0)
      await expect(page.getByLabel('Reviewer', { exact: true })).toHaveCount(0)
    })
  })
})
