import { expect, test } from '../fixtures/test'
import { demoTitle, expectRefusedBeside, openApplication } from './support'

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
