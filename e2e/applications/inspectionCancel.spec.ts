import { expect, test } from '../fixtures/test'
import { demoTitle, openApplication } from './support'

const SERVICE = demoTitle('Service upgrade')

function finalInspection(page: import('@playwright/test').Page) {
  return page
    .getByRole('region', { name: 'Inspections', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'Final inspection' })
}

test.describe('cancelling an inspection from the permit', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('asks first, keeps the inspection when declined, and cancels when confirmed', async ({
      page,
      db,
    }) => {
      await openApplication(page, db, SERVICE)
      const row = finalInspection(page)
      await expect(row).toContainText('Scheduled')
      await row.getByText('Cancel', { exact: true }).click()
      await row.getByRole('button', { name: 'Cancel this inspection' }).click()

      const dialog = page.getByRole('dialog', { name: 'Cancel this inspection?' })
      await expect(dialog).toContainText(
        'The inspection is cancelled. Request a new one if it is still needed.',
      )
      await dialog.getByRole('button', { name: 'Keep the inspection' }).click()
      await expect(dialog).toHaveCount(0)
      const kept = await db.one<{ status: string }>(
        `select i.status from inspections i join applications a on a.id = i.application_id
          join projects p on p.id = a.project_id
          where p.title = $1 and i.inspection_type = 'final'`,
        [SERVICE],
      )
      expect(kept.status).toBe('scheduled')

      await row.getByRole('button', { name: 'Cancel this inspection' }).click()
      await dialog.getByRole('button', { name: 'Cancel the inspection' }).click()
      await expect(row).toContainText('Cancelled')
      const done = await db.one<{ status: string }>(
        `select i.status from inspections i join applications a on a.id = i.application_id
          join projects p on p.id = a.project_id
          where p.title = $1 and i.inspection_type = 'final'`,
        [SERVICE],
      )
      expect(done.status).toBe('cancelled')
    })
  })

  test.describe('as the administrator', () => {
    test.use({ role: 'admin' })

    test('sees the inspection without a way to cancel it', async ({ page, db }) => {
      await openApplication(page, db, SERVICE)
      await expect(finalInspection(page)).toContainText('Final inspection')
      await expect(page.getByText('Cancel this inspection')).toHaveCount(0)
    })
  })
})
