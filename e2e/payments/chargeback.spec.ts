import type { Page } from '@playwright/test'
import { type E2eDb, expect, test } from '../fixtures/test'
import {
  confirmWith,
  demoTitle,
  entryItem,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
  formWith,
  openApplication,
  openEntryControls,
} from './support'

const SOURCE = demoTitle('Payments: Bathroom paid by simulated card')
const CARD_ENTRY = /payment by card present: \$46\.35/
const REASON = 'Reason (at least 10 characters)'
const REASON_REFUSAL = 'Enter a reason of at least 10 characters.'
const GOOD_REASON = 'Cardholder disputed the charge'
const SUBMIT = 'Record chargeback'

async function chargebacks(db: E2eDb) {
  return await db.rows<{ amount_cents: number; method: string; reason: string | null }>(
    `select amount_cents, method, reason from ledger_entries where entry_type = 'chargeback'`,
  )
}

async function chargebackForm(page: Page, db: E2eDb) {
  await openApplication(page, db, SOURCE)
  return formWith(await openEntryControls(entryItem(page, CARD_ENTRY)), SUBMIT)
}

test.describe
  .serial('recording a card chargeback', () => {
    test.use({ role: 'finance' })

    test('a reason under 10 characters is refused beside it and no dialog opens', async ({
      page,
      db,
    }) => {
      const form = await chargebackForm(page, db)
      await form.getByLabel('Dispute reference').fill('DP-1001')
      await form.getByLabel('Amount in dollars').fill('5.00')
      await form.getByLabel(REASON).fill('too short')
      await form.getByRole('button', { name: SUBMIT }).click()
      await expectRefusedBeside(form.getByLabel(REASON), REASON_REFUSAL)
      await expectNoDialog(page)
      expect(await chargebacks(db)).toEqual([])
    })

    test('a chargeback larger than the payment is refused beside the amount', async ({
      page,
      db,
    }) => {
      const form = await chargebackForm(page, db)
      await form.getByLabel('Dispute reference').fill('DP-1001')
      await form.getByLabel('Amount in dollars').fill('500.00')
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: SUBMIT }).click()
      await confirmWith(page, 'Record this chargeback?', SUBMIT)
      await expectRefusedBeside(form.getByLabel('Amount in dollars'), 'That is more than was paid.')
      expect(await chargebacks(db)).toEqual([])
    })

    test('a valid chargeback opens the dialog and stores a negative chargeback row', async ({
      page,
      db,
    }) => {
      const form = await chargebackForm(page, db)
      await form.getByLabel('Dispute reference').fill('DP-1001')
      await form.getByLabel('Amount in dollars').fill('5.00')
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: SUBMIT }).click()
      await confirmWith(page, 'Record this chargeback?', SUBMIT)
      await expectConfirmation(page, 'Chargeback recorded.')
      expect(await chargebacks(db)).toEqual([
        { amount_cents: -500, method: 'card_present', reason: GOOD_REASON },
      ])
    })
  })
