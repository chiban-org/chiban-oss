import type { Page } from '@playwright/test'
import { type E2eDb, expect, test } from '../fixtures/test'
import {
  applicationByNumber,
  entryItem,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
  formWith,
  openEntryControls,
} from './support'

const SOURCE = 'MG-2026-0001'
const TARGET = 'VAR-2026-0005'
const REASON = 'Reason (at least 10 characters)'
const REASON_REFUSAL = 'Enter a reason of at least 10 characters.'
const GOOD_REASON = 'Posted to the wrong permit'
const SOURCE_ENTRY = /payment by cash: \$45\.00/
const SUBMIT = 'Move to another permit'

interface Correction {
  number: string
  entry_cents: number
  moved_cents: number
}

async function corrections(db: E2eDb): Promise<Correction[]> {
  return await db.rows<Correction>(
    `select app.number, e.amount_cents as entry_cents, a.amount_cents as moved_cents
       from ledger_entries e
       join ledger_allocations a on a.entry_id = e.id
       join applications app on app.id = a.application_id
      where e.entry_type = 'correction' and e.reason = $1
      order by a.amount_cents`,
    [GOOD_REASON],
  )
}

async function moveForm(page: Page, db: E2eDb) {
  await applicationByNumber(page, db, SOURCE)
  const form = formWith(await openEntryControls(entryItem(page, SOURCE_ENTRY)), SUBMIT)
  await form.getByLabel('Move to').selectOption({ label: TARGET })
  return form
}

test.describe
  .serial('moving a payment to another permit', () => {
    test.use({ role: 'finance' })

    test('a reason under 10 characters is refused beside it and nothing moves', async ({
      page,
      db,
    }) => {
      const form = await moveForm(page, db)
      await form.getByLabel('Amount in dollars').fill('5.00')
      await form.getByLabel(REASON).fill('too short')
      await form.getByRole('button', { name: SUBMIT }).click()
      await expectRefusedBeside(form.getByLabel(REASON), REASON_REFUSAL)
      await expectNoDialog(page)
      expect(await corrections(db)).toEqual([])
    })

    test('moving more than the payment is refused beside the amount', async ({ page, db }) => {
      const form = await moveForm(page, db)
      await form.getByLabel('Amount in dollars').fill('45.01')
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: SUBMIT }).click()
      await expectRefusedBeside(form.getByLabel('Amount in dollars'), 'That is more than was paid.')
      expect(await corrections(db)).toEqual([])
    })

    test('a valid move stores the correction rows', async ({ page, db }) => {
      const form = await moveForm(page, db)
      await form.getByLabel('Amount in dollars').fill('5.00')
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: SUBMIT }).click()
      await expectConfirmation(page, 'Correction recorded.')
      expect(await corrections(db)).toEqual([
        { number: SOURCE, entry_cents: 0, moved_cents: -500 },
        { number: TARGET, entry_cents: 0, moved_cents: 500 },
      ])
    })
  })
