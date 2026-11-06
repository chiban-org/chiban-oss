import { expect, test } from '../fixtures/test'
import {
  applicationByNumber,
  expectConfirmation,
  expectRefusedBeside,
  formWith,
  ledgerFor,
  ledgerSection,
  openRecordPayment,
} from './support'

const PERMIT = 'EL-2026-0004'

test.describe
  .serial('recording a cash or check payment at the desk', () => {
    let payer = ''

    test.describe('as staff', () => {
      test.use({ role: 'staff' })

      test('refuses a check with no check number beside the field and stores nothing', async ({
        page,
        db,
        suffix,
      }) => {
        payer = `Pat Payer ${suffix}`
        await applicationByNumber(page, db, PERMIT)
        const form = formWith(await openRecordPayment(page), 'Record payment')
        await form.getByLabel('Amount in dollars').fill('25.00')
        await form.getByLabel('Payer name').fill(payer)
        await form.getByRole('button', { name: 'Record payment' }).click()
        await expectRefusedBeside(form.getByLabel('Check number'), 'Enter the check number.')
        expect(await ledgerFor(db, payer)).toEqual([])
      })

      test('refuses paying more than the balance beside the amount', async ({ page, db }) => {
        await applicationByNumber(page, db, PERMIT)
        const form = formWith(await openRecordPayment(page), 'Record payment')
        await form.getByLabel('Amount in dollars').fill('45.01')
        await form.getByLabel('Check number').fill('7001')
        await form.getByLabel('Payer name').fill(payer)
        await form.getByRole('button', { name: 'Record payment' }).click()
        await expectRefusedBeside(
          form.getByLabel('Amount in dollars'),
          'That payment is more than what is due.',
        )
        expect(await ledgerFor(db, payer)).toEqual([])
      })

      test('records a check, then cash, and stores both ledger rows', async ({ page, db }) => {
        await applicationByNumber(page, db, PERMIT)
        const checkForm = formWith(await openRecordPayment(page), 'Record payment')
        await checkForm.getByLabel('Amount in dollars').fill('25.00')
        await checkForm.getByLabel('Check number').fill('7001')
        await checkForm.getByLabel('Payer name').fill(payer)
        await checkForm.getByRole('button', { name: 'Record payment' }).click()
        await expectConfirmation(page, 'Payment recorded on receipt')
        await expect(ledgerSection(page).getByText('Balance due $20.00.')).toBeVisible()

        const cashForm = formWith(await openRecordPayment(page), 'Record payment')
        await cashForm.getByLabel('Paid by').selectOption({ label: 'Cash' })
        await cashForm.getByLabel('Amount in dollars').fill('20.00')
        await cashForm.getByLabel('Payer name').fill(payer)
        await cashForm.getByRole('button', { name: 'Record payment' }).click()
        await expect(ledgerSection(page).getByText('Balance due $0.00.')).toBeVisible()

        const rows = await ledgerFor(db, payer)
        expect(rows).toHaveLength(2)
        expect(rows).toContainEqual(
          expect.objectContaining({
            entry_type: 'payment',
            method: 'check',
            amount_cents: 2500,
            check_number: '7001',
          }),
        )
        expect(rows).toContainEqual(
          expect.objectContaining({ entry_type: 'payment', method: 'cash', amount_cents: 2000 }),
        )
      })
    })
  })
