import { expect, test } from '../fixtures/test'
import { demoTitle, openApplication, openMoreActions } from './support'

test.describe('choosing the workflow step', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('sets the step to zoning review and stores it', async ({ page, db }) => {
      const id = await openApplication(page, db, demoTitle('Mudroom addition due this week'))
      const more = await openMoreActions(page)
      await more.getByLabel('Step', { exact: true }).selectOption({ label: 'Zoning review' })
      await more.getByRole('button', { name: 'Set step' }).click()

      await expect(more.getByRole('status').filter({ hasText: 'Step updated.' })).toBeVisible()
      const row = await db.one<{ substep: string }>(
        'select substep from applications where id = $1',
        [id],
      )
      expect(row.substep).toBe('zoning_review')
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered the step form', async ({ page, db }) => {
      await openApplication(page, db, demoTitle('Brookside setback variance'))
      await expect(page.getByLabel('Step', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Set step' })).toHaveCount(0)
    })
  })
})
