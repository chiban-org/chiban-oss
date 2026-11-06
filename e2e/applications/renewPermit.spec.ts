import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import { demoTitle, expectRefusedBeside, openApplication } from './support'

const SERVICE = demoTitle('Service upgrade')

async function openRenewal(page: Page) {
  const nextStep = page.getByRole('region', { name: 'Next step' })
  await nextStep.getByText('More actions', { exact: true }).click()
  await nextStep.getByText('Renew the permit', { exact: true }).click()
  return nextStep
}

test.describe('renewing an issued permit', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a blank renewal date beside the field and renews nothing', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, SERVICE)
      const nextStep = await openRenewal(page)
      await nextStep.getByLabel('Renewed on').fill('')
      await nextStep.getByRole('button', { name: 'Renew permit' }).click()

      await expectRefusedBeside(nextStep.getByLabel('Renewed on'), 'Enter the renewal date.')
      const row = await db.one<{ count: string }>(
        "select count(*) from clock_adjustments ca join clocks c on c.id = ca.clock_id where c.application_id = $1 and ca.kind = 'renewal'",
        [id],
      )
      expect(Number(row.count)).toBe(0)
    })

    test('renews the permit from today and shows the new end date', async ({ page, db }) => {
      const id = await openApplication(page, db, SERVICE)
      const nextStep = await openRenewal(page)
      await nextStep.getByRole('button', { name: 'Renew permit' }).click()

      await expect(
        nextStep.getByRole('status').filter({ hasText: 'Renewed. The permit now runs to ' }),
      ).toBeVisible()
      const row = await db.one<{ count: string }>(
        "select count(*) from clock_adjustments ca join clocks c on c.id = ca.clock_id where c.application_id = $1 and ca.kind = 'renewal'",
        [id],
      )
      expect(Number(row.count)).toBe(1)
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered renewal', async ({ page, db }) => {
      await openApplication(page, db, SERVICE)
      await expect(page.getByText('Renew the permit', { exact: true })).toHaveCount(0)
    })
  })
})
