import { expect, fillDate, signInWithMagicLink, test } from '../fixtures/test'
import { applicationIdFor, demoTitle, expectRefusedBeside } from './support'

const FENCE = demoTitle('Fence along the north line')

test.describe('marking a building permit application complete', () => {
  test.describe.configure({ mode: 'serial' })

  test.describe('after the applicant submits it', () => {
    test.use({ role: 'applicant' })

    test('the applicant submits the draft fence permit', async ({ page, db, suffix }) => {
      const id = await applicationIdFor(db, FENCE)
      await page.goto(`/portal/applications/${id}`)
      await page.getByLabel('Type of work').click()
      await page.getByRole('option', { name: 'Building', exact: true }).click()
      await page.getByLabel('Description of work').fill(`Cedar fence, 60 feet, ref ${suffix}`)
      await page.getByLabel('Use classification').click()
      await page.getByRole('option', { name: 'Residential', exact: true }).click()
      await page.getByLabel(/I attest that the information/).check()
      await page.getByRole('button', { name: 'Submit application' }).click()

      await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible()
      const row = await db.one<{ state: string }>('select state from applications where id = $1', [
        id,
      ])
      expect(row.state).toBe('submitted')
    })
  })

  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a completed date in the future beside the field and stores nothing', async ({
      page,
      db,
    }) => {
      const id = await applicationIdFor(db, FENCE)
      await page.goto(`/staff/applications/${id}`)
      const completeness = page.getByRole('region', { name: 'Completeness' })
      await fillDate(completeness.getByLabel('Completed on'), '2099-01-02')
      await completeness.getByRole('button', { name: 'Mark complete' }).click()

      await expectRefusedBeside(
        completeness.getByLabel('Completed on'),
        'Enter the completed date between January 1, 1900 and ',
      )
      const row = await db.one<{ completed_date: string | null }>(
        'select completed_date from applications where id = $1',
        [id],
      )
      expect(row.completed_date).toBeNull()
    })

    test('marks it complete today and starts the decision clock', async ({ page, db }) => {
      const id = await applicationIdFor(db, FENCE)
      await page.goto(`/staff/applications/${id}`)
      const completeness = page.getByRole('region', { name: 'Completeness' })
      await completeness.getByRole('button', { name: 'Mark complete' }).click()

      await expect(completeness.getByRole('status')).toHaveText(
        'Marked complete. The decision clock is running.',
      )
      const row = await db.one<{ completed_date: string | null }>(
        'select completed_date from applications where id = $1',
        [id],
      )
      expect(row.completed_date).not.toBeNull()
    })
  })
})
