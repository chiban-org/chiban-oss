import type { Page } from '@playwright/test'
import { type E2eDb, expect, fillDate, test } from '../fixtures/test'
import { demoTitle, expectRefusedBeside, openApplication, openMoreActions } from './support'

const DECK = demoTitle('Deck renewed once')

test.describe('adjusting a clock', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses an extension with a blank reason beside the field and stores nothing', async ({
      page,
      db,
    }) => {
      await openApplication(page, db, DECK)
      const clocks = page.getByRole('region', { name: 'Clocks' })
      await clocks.getByText('Adjust this clock', { exact: true }).first().click()
      await clocks.getByLabel('Days').first().fill('17')
      await clocks.getByLabel('Reason').first().fill('   ')
      await clocks.getByRole('button', { name: 'Apply adjustment' }).first().click()

      await expectRefusedBeside(clocks.getByLabel('Reason').first(), 'Enter a reason.')
      const row = await db.one<{ count: string }>(
        'select count(*) from clock_adjustments where days = 17 and kind = $1',
        ['extension'],
      )
      expect(Number(row.count)).toBe(0)
    })

    test('extends the clock by 30 days with consent and stores the adjustment', async ({
      page,
      db,
      suffix,
    }) => {
      await openApplication(page, db, DECK)
      const reason = `Owner asked for time and agreed, ref ${suffix}`
      const clocks = page.getByRole('region', { name: 'Clocks' })
      await clocks.getByText('Adjust this clock', { exact: true }).first().click()
      await clocks.getByLabel('Days').first().fill('30')
      await clocks.getByLabel('Reason').first().fill(reason)
      await clocks.getByLabel('The applicant consents').first().check()
      await clocks.getByRole('button', { name: 'Apply adjustment' }).first().click()

      await expect(clocks.getByRole('status').first()).toContainText(
        'Clock adjusted. It is now due',
      )
      const row = await db.one<{ kind: string; days: number; applicant_consent: boolean }>(
        'select kind, days, applicant_consent from clock_adjustments where reason = $1',
        [reason],
      )
      expect(row).toEqual({ kind: 'extension', days: 30, applicant_consent: true })
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered the adjustment form', async ({ page, db }) => {
      await openApplication(page, db, DECK)
      const clocks = page.getByRole('region', { name: 'Clocks' })
      await expect(clocks.getByRole('heading', { name: 'Clocks' })).toBeVisible()
      await expect(clocks.getByText('Adjust this clock', { exact: true })).toHaveCount(0)
    })
  })
})

async function openRenewal(page: Page) {
  const nextStep = await openMoreActions(page)
  await nextStep.getByText('Renew the permit', { exact: true }).click()
  return nextStep
}

async function renewals(db: E2eDb, id: string): Promise<number> {
  const row = await db.one<{ count: string }>(
    "select count(*) from clock_adjustments ca join clocks c on c.id = ca.clock_id where c.application_id = $1 and ca.kind = 'renewal'",
    [id],
  )
  return Number(row.count)
}

test.describe('renewing an issued permit', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a blank renewal date beside the field and renews nothing', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, DECK)
      const before = await renewals(db, id)
      const nextStep = await openRenewal(page)
      await nextStep.getByLabel('Renewed on').fill('')
      await nextStep.getByRole('button', { name: 'Renew permit' }).click()

      await expectRefusedBeside(nextStep.getByLabel('Renewed on'), 'Fill in: Renewed on.')
      expect(await renewals(db, id)).toBe(before)
    })

    test('refuses a renewal date in the future beside the field and renews nothing', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, DECK)
      const before = await renewals(db, id)
      const nextStep = await openRenewal(page)
      await fillDate(nextStep.getByLabel('Renewed on'), '2099-03-04')
      await nextStep.getByRole('button', { name: 'Renew permit' }).click()

      await expectRefusedBeside(
        nextStep.getByLabel('Renewed on'),
        'Enter the renewal date between January 1, 1900 and ',
      )
      expect(await renewals(db, id)).toBe(before)
    })

    test('refuses a renewal while the last renewal fee is unpaid and renews nothing', async ({
      page,
      db,
    }) => {
      const id = await openApplication(page, db, DECK)
      const before = await renewals(db, id)
      const nextStep = await openRenewal(page)
      await nextStep.getByRole('button', { name: 'Renew permit' }).click()

      await expect(
        nextStep.getByRole('status').filter({
          hasText:
            'The fee for the last renewal has not been paid. Record that payment before renewing again.',
        }),
      ).toBeVisible()
      expect(await renewals(db, id)).toBe(before)
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered renewal', async ({ page, db }) => {
      await openApplication(page, db, DECK)
      await expect(page.getByText('Renew the permit', { exact: true })).toHaveCount(0)
    })
  })
})
