import { accountFor, expect, test } from '../fixtures/test'
import { countRows, expectConfirmation, expectRefusedBeside, startCase } from './support'

const CASES_BY_LOCATION = 'select count(*) from enforcement_cases where location_text = $1'

test.describe('opening a case', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('opens a case, lands on it assigned to the clerk and stores it', async ({
      page,
      db,
      suffix,
    }) => {
      const location = `18 Alder Bend ${suffix}`
      const caseId = await startCase(page, location)
      await expect(page.getByText(location, { exact: true })).toBeVisible()
      await expect(page.getByText('Received', { exact: true }).first()).toBeVisible()
      const row = await db.one<{ assigned_to: string; status: string }>(
        'select assigned_to, status from enforcement_cases where id = $1',
        [caseId],
      )
      expect(row.status).toBe('intake')
      expect(row.assigned_to).toBe(await db.userIdFor(accountFor('staff').email))
    })

    test('a same-tick double submit opens one case', async ({ page, db, suffix }) => {
      const location = `20 Alder Bend ${suffix}`
      await page.goto('/staff/enforcement')
      await page.getByRole('button', { name: 'Open a case' }).click()
      const dialog = page.getByRole('dialog', { name: 'Open a case' })
      await dialog.getByLabel('Where is the property?').fill(location)
      await dialog.getByRole('button', { name: 'Open case' }).evaluate((button: HTMLElement) => {
        button.click()
        button.click()
      })
      await page.waitForURL(/\/staff\/enforcement\/[0-9a-f-]{36}$/)
      expect(await countRows(db, CASES_BY_LOCATION, [location])).toBe(1)
    })

    test('two requests from two sessions at once open one case', async ({
      page,
      pageAs,
      db,
      suffix,
    }) => {
      const location = `22 Alder Bend ${suffix}`
      const other = await pageAs('staff')
      const dialogs = await Promise.all(
        [page, other].map(async (p) => {
          await p.goto('/staff/enforcement')
          await p.getByRole('button', { name: 'Open a case' }).click()
          const dialog = p.getByRole('dialog', { name: 'Open a case' })
          await dialog.getByLabel('Where is the property?').fill(location)
          return dialog
        }),
      )
      await Promise.all(dialogs.map((d) => d.getByRole('button', { name: 'Open case' }).click()))
      await Promise.all(
        [page, other].map((p) => p.waitForURL(/\/staff\/enforcement\/[0-9a-f-]{36}$/)),
      )
      expect(await countRows(db, CASES_BY_LOCATION, [location])).toBe(1)
    })

    test('refuses a case with no location beside the field and opens nothing', async ({ page }) => {
      await page.goto('/staff/enforcement')
      await page.getByRole('button', { name: 'Open a case' }).click()
      const dialog = page.getByRole('dialog', { name: 'Open a case' })
      await dialog.getByLabel('Where is the property?').fill('   ')
      await dialog.getByRole('button', { name: 'Open case' }).click()
      await expectRefusedBeside(
        dialog.getByLabel('Where is the property?'),
        'Enter where the property is.',
      )
      await expect(page).toHaveURL(/\/staff\/enforcement$/)
    })

    test('records a complaint taken at the counter and opens a case for it', async ({
      page,
      db,
      suffix,
    }) => {
      const description = `Tarp roof on the barn, ref ${suffix}`
      await page.goto('/staff/enforcement')
      await page.getByRole('button', { name: 'Enter a complaint' }).click()
      const dialog = page.getByRole('dialog', {
        name: 'Enter a complaint taken by phone or at the counter',
      })
      await dialog.getByLabel('Where is the property?').fill(`3 Barn Lane ${suffix}`)
      await dialog.getByLabel('What was reported?').fill(description)
      await dialog.getByRole('button', { name: 'Record complaint' }).click()
      await expectConfirmation(page, 'Complaint recorded.')
      const row = await db.one<{ channel: string; case_id: string | null }>(
        'select channel, case_id from complaints where description_original = $1',
        [description],
      )
      expect(row.channel).toBe('staff_entry')
      expect(row.case_id).not.toBeNull()
    })

    test('refuses a complaint with no description beside the field', async ({ page, suffix }) => {
      await page.goto('/staff/enforcement')
      await page.getByRole('button', { name: 'Enter a complaint' }).click()
      const dialog = page.getByRole('dialog', {
        name: 'Enter a complaint taken by phone or at the counter',
      })
      await dialog.getByLabel('Where is the property?').fill(`4 Barn Lane ${suffix}`)
      await dialog.getByRole('button', { name: 'Record complaint' }).click()
      await expectRefusedBeside(
        dialog.getByLabel('What was reported?'),
        'Fill in: What was reported.',
      )
    })
  })
})
