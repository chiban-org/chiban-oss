import { expect, test } from '../fixtures/test'
import { demoTitle, expectRefusedBeside, openApplication } from './support'

const PINTAIL = demoTitle('Pintail Way setback variance')

test.describe('waiving or setting a fee', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a set amount with no amount beside the field and stores nothing', async ({
      page,
      db,
      suffix,
    }) => {
      await openApplication(page, db, PINTAIL)
      const fees = page.getByRole('region', { name: 'Fees and payments' })
      await fees.getByText('Waive or set a fee', { exact: true }).click()
      await fees.getByLabel('Override', { exact: true }).selectOption({ label: 'Set an amount' })
      await fees.getByLabel('Reason').fill(`Hardship, ref ${suffix}`)
      await fees.getByRole('button', { name: 'Save fee override' }).click()

      await expectRefusedBeside(
        fees.getByLabel('Amount in dollars (for a set amount)'),
        'Enter the amount.',
      )
      const row = await db.one<{ count: string }>(
        'select count(*) from fee_overrides where reason = $1',
        [`Hardship, ref ${suffix}`],
      )
      expect(Number(row.count)).toBe(0)
    })

    test('waives the application fee with a reason and stores the override', async ({
      page,
      db,
      suffix,
    }) => {
      const id = await openApplication(page, db, PINTAIL)
      const reason = `Town-sponsored project, ref ${suffix}`
      const fees = page.getByRole('region', { name: 'Fees and payments' })
      await fees.getByText('Waive or set a fee', { exact: true }).click()
      await fees.getByLabel('Reason').fill(reason)
      await fees.getByRole('button', { name: 'Save fee override' }).click()

      await expect(fees.getByText(`Application fee: waived. ${reason}`)).toBeVisible()
      const row = await db.one<{ kind: string; fee_code: string }>(
        'select kind, fee_code from fee_overrides where application_id = $1 and reason = $2',
        [id, reason],
      )
      expect(row.kind).toBe('waive')
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('is not offered the fee override', async ({ page, db }) => {
      await openApplication(page, db, PINTAIL)
      await expect(page.getByText('Waive or set a fee', { exact: true })).toHaveCount(0)
    })
  })
})
