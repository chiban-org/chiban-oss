import { expect, test } from '../fixtures/test'
import { applicationByNumber, entryItem, ledgerSection, seededAttemptId } from './support'

test.describe('payment controls by role', () => {
  test.describe('as staff', () => {
    test.use({ role: 'staff' })

    test('refund, correct and reverse controls are absent on a recorded payment', async ({
      page,
      db,
    }) => {
      await applicationByNumber(page, db, 'MG-2026-0001')
      await expect(entryItem(page, /payment by cash: \$45\.00/)).toBeVisible()
      await expect(page.getByText('Refund, correct, or reverse')).toHaveCount(0)
    })
  })

  test.describe('as inspector', () => {
    test.use({ role: 'inspector' })

    test('the record payment form is absent', async ({ page, db }) => {
      await applicationByNumber(page, db, 'EL-2026-0004')
      await expect(
        ledgerSection(page).getByRole('heading', { name: 'Fees and payments' }),
      ).toBeVisible()
      await expect(page.getByText('Take a payment')).toHaveCount(0)
    })

    test('the card attempt page refuses', async ({ page, db }) => {
      const attemptId = await seededAttemptId(db, 'PL-2026-0001')
      await page.goto(`/staff/payments/${attemptId}`)
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'You do not have permission to view payments.',
      )
      await expect(page.getByRole('button', { name: 'Check with processor' })).toHaveCount(0)
    })
  })
})
