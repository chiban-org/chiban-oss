import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import {
  confirmWith,
  demoTitle,
  entryItem,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
  formWith,
  ledgerFor,
  ledgerOfType,
  openApplication,
  openEntryControls,
  recordDeskPayment,
} from './support'

const SOURCE = demoTitle('Panel upgrade with documents')
const SHORT_REASON = 'too short'
const GOOD_REASON = 'Customer paid twice at the counter'
const REASON_REFUSAL = 'Enter a reason of at least 10 characters.'

test.describe
  .serial('refunding a cash payment', () => {
    test.use({ role: 'finance' })
    let payer = ''

    function cashEntry(page: Page) {
      return entryItem(page, `payment by cash: $20.00 from ${payer}.`)
    }

    test('finance records a cash payment and it reaches the ledger', async ({
      page,
      db,
      suffix,
    }) => {
      payer = `Fern Payer ${suffix}`
      await openApplication(page, db, SOURCE)
      await recordDeskPayment(page, { method: 'Cash', amount: '20.00', payer })
      expect(await ledgerFor(db, payer)).toEqual([
        expect.objectContaining({ entry_type: 'payment', method: 'cash', amount_cents: 2000 }),
      ])
    })

    test('a refund reason under 10 characters is refused and no dialog opens', async ({
      page,
      db,
    }) => {
      await openApplication(page, db, SOURCE)
      const controls = await openEntryControls(cashEntry(page))
      const form = formWith(controls, 'Refund')
      await form.getByLabel('Refund amount in dollars').fill('5.00')
      await form.getByLabel('Reason (at least 10 characters)').fill(SHORT_REASON)
      await form.getByRole('button', { name: 'Refund', exact: true }).click()
      await expectRefusedBeside(form.getByLabel('Reason (at least 10 characters)'), REASON_REFUSAL)
      await expectNoDialog(page)
      expect(await ledgerOfType(db, payer, 'refund')).toEqual([])
    })

    test('refunding more than was paid is refused beside the amount', async ({ page, db }) => {
      await openApplication(page, db, SOURCE)
      const controls = await openEntryControls(cashEntry(page))
      const form = formWith(controls, 'Refund')
      await form.getByLabel('Refund amount in dollars').fill('20.01')
      await form.getByLabel('Reason (at least 10 characters)').fill(GOOD_REASON)
      await form.getByRole('button', { name: 'Refund', exact: true }).click()
      await confirmWith(page, 'Refund this payment?', 'Refund')
      await expectRefusedBeside(
        form.getByLabel('Refund amount in dollars'),
        'That is more than was paid.',
      )
      expect(await ledgerOfType(db, payer, 'refund')).toEqual([])
    })

    test('a valid refund opens the dialog and stores a negative refund row', async ({
      page,
      db,
    }) => {
      await openApplication(page, db, SOURCE)
      const controls = await openEntryControls(cashEntry(page))
      const form = formWith(controls, 'Refund')
      await form.getByLabel('Refund amount in dollars').fill('5.00')
      await form.getByLabel('Reason (at least 10 characters)').fill(GOOD_REASON)
      await form.getByRole('button', { name: 'Refund', exact: true }).click()
      await confirmWith(page, 'Refund this payment?', 'Refund')
      await expectConfirmation(page, 'Refund recorded on receipt')
      const refunds = await ledgerOfType(db, payer, 'refund')
      expect(refunds).toEqual([
        expect.objectContaining({ method: 'cash', amount_cents: -500, reason: GOOD_REASON }),
      ])
    })
  })
