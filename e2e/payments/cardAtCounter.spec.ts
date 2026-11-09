import { openTrade, unpaidTradeAtCounter } from '../applications/tradeSupport'
import { expect, test } from '../fixtures/test'
import { expectConfirmation, ledgerFor, ledgerSection, openRecordPayment } from './support'

test.describe('card at the counter for a balance on an application', () => {
  test.use({ role: 'staff' })

  test('a declined card posts nothing, and an approved one posts the payment', async ({
    page,
    db,
    suffix,
  }) => {
    const trade = await unpaidTradeAtCounter(page, db, suffix)
    const payer = `Card Payer ${suffix}`
    await openTrade(page, trade)

    const card = (await openRecordPayment(page)).getByRole('group', { name: 'Card at the counter' })
    await expect(card).toContainText(/^Card at the counter/)
    await expect(card).toContainText(/The reader charges \$[\d.]+/)
    await card.getByLabel('Name of the person paying by card').fill(payer)
    await card.getByRole('button', { name: 'Start card payment' }).click()
    await expect(card).toContainText('Nothing is posted until the processor approves.')
    expect(await ledgerFor(db, payer)).toEqual([])

    await card.getByRole('button', { name: 'Decline' }).click()
    await expect(card).toContainText(
      'Card declined. Nothing was charged and the balance is unchanged.',
    )
    expect(await ledgerFor(db, payer)).toEqual([])

    await card.getByRole('button', { name: 'Try the card again' }).click()
    await card.getByLabel('Name of the person paying by card').fill(payer)
    await card.getByRole('button', { name: 'Start card payment' }).click()
    await card.getByRole('button', { name: 'Approve' }).click()
    await expectConfirmation(page, 'Card approved. The payment is in the ledger.')
    await expect(ledgerSection(page).getByText('Balance due $0.00.')).toBeVisible()
    const rows = await ledgerFor(db, payer)
    expect(rows.map((r) => [r.entry_type, r.method])).toEqual([['payment', 'card_present']])
  })
})
