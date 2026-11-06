import { type E2eDb, expect, test } from '../fixtures/test'
import { demoTitle, openApplication } from './support'

interface StateRow {
  state: string
}

const stateOf = (db: E2eDb, id: string) =>
  db.one<StateRow>('select state from applications where id = $1', [id])

test.describe('moving an application through its workflow', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('moves a submitted electrical permit to under review and stores the new state', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, demoTitle('Subpanel for the barn'))
      await page.getByRole('button', { name: 'Move to under review' }).click()

      await expect(page.getByText('Moved the application to Under review')).toBeVisible()
      expect((await stateOf(db, id)).state).toBe('under_review')
    })

    test('withdrawing asks first, keeps the application when declined, and withdraws when confirmed', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, demoTitle('Brookside setback variance'))
      await page
        .getByRole('region', { name: 'Next step' })
        .getByText('More actions', { exact: true })
        .click()
      const trigger = page.getByRole('button', { name: 'Move to withdrawn' })
      await trigger.click()

      const dialog = page.getByRole('dialog', { name: 'Move VAR-2026-0001 to withdrawn?' })
      await expect(dialog).toContainText(
        'Moving to withdrawn ends this application. It cannot be undone.',
      )
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toHaveCount(0)
      expect((await stateOf(db, id)).state).toBe('submitted')

      await trigger.click()
      await dialog.getByRole('button', { name: 'Move to withdrawn' }).click()
      await expect(page.getByText('Moved the application to Withdrawn')).toBeVisible()
      expect((await stateOf(db, id)).state).toBe('withdrawn')
    })

    test('lists what blocks the next move instead of offering it', async ({ page, db }) => {
      await openApplication(page, db, demoTitle('Addition under review'))
      const blockers = page.getByRole('list', { name: 'What blocks decided' })
      await expect(blockers).toContainText('Assigned reviews signed off')
      await expect(blockers).toContainText('No reviewer is assigned.')
      await expect(page.getByRole('button', { name: 'Move to decided' })).toHaveCount(0)
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('sees no move buttons on a submitted permit', async ({ page, db }) => {
      await openApplication(page, db, demoTitle('Panel upgrade with documents'))
      await expect(page.getByRole('button', { name: /^Move to / })).toHaveCount(0)
      await expect(page.getByText('More actions', { exact: true })).toHaveCount(0)
    })
  })
})
