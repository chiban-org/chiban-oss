import { expect, test, waitForEmail } from '../fixtures/test'
import {
  counterJob,
  fillElectricalJob,
  licenseApplication,
  openElectricalForm,
} from './counterSupport'
import { expectRefusedBeside } from './support'

test.describe('issuing a permit at the counter', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a blank contractor name beside the field and creates nothing', async ({
      page,
      db,
      suffix,
    }) => {
      await openElectricalForm(page)
      await page.getByLabel('License number').fill(`EL-${suffix}`)
      await page.getByRole('button', { name: 'Issue and print' }).click()

      await expectRefusedBeside(page.getByLabel('Contractor name'), 'Enter')
      const rows = await db.rows<{ id: string }>(
        'select id from license_checks where license_number = $1',
        [`EL-${suffix}`],
      )
      expect(rows).toHaveLength(0)
    })

    test('takes cash, issues the permit and shows its number', async ({ page, db, suffix }) => {
      const job = counterJob(suffix)
      await openElectricalForm(page)
      await fillElectricalJob(page, job)
      await page.getByLabel('Cash tendered (dollars)').fill('1000')
      await page.getByRole('button', { name: 'Issue and print' }).click()

      const issued = page.getByRole('status').filter({ hasText: / is issued$/ })
      await expect(issued).toBeVisible()
      const row = await licenseApplication(db, job.license)
      expect(row.state).toBe('issued')
      await expect(issued).toHaveText(`${row.number} is issued`)
      await expect(page.getByRole('link', { name: 'Open the application record' })).toHaveAttribute(
        'href',
        `/staff/applications/${row.application_id}`,
      )
    })

    test('sends the contractor a claim link after issuing', async ({ page, db, suffix }) => {
      const job = counterJob(suffix)
      const since = new Date()
      await openElectricalForm(page)
      await fillElectricalJob(page, job)
      await page.getByLabel('Cash tendered (dollars)').fill('1000')
      await page.getByRole('button', { name: 'Issue and print' }).click()
      await page.getByRole('button', { name: 'Send claim link to contractor' }).click()

      await expect(
        page.getByRole('status').filter({ hasText: 'Claim link sent to the contractor.' }),
      ).toBeVisible()
      const message = await waitForEmail({
        to: job.email,
        since,
        subject: 'Claim your project in Chiban',
      })
      expect(message.subject).toContain('Claim your project in Chiban')
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is refused the counter', async ({ page }) => {
      await page.goto('/staff/counter')
      await expect(
        page.getByText('You do not have permission to issue permits at the counter.'),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: 'Electrical permit' })).toHaveCount(0)
    })
  })
})
