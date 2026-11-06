import type { Page } from '@playwright/test'
import { townToday } from '../boards/records'
import { type E2eDb, expect, fillDate, test } from '../fixtures/test'
import {
  applicationByNumber,
  confirmWith,
  entryItem,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
  formWith,
  ledgerOfType,
  openEntryControls,
  recordDeskPayment,
} from './support'

const SOURCE = 'EL-2026-0003'
const SHORT_REASON = 'too short'
const GOOD_REASON = 'Bank returned the check, no funds'
const REASON_REFUSAL = 'Enter a reason of at least 10 characters.'
const REASON = 'Reason (at least 10 characters)'

test.describe
  .serial('recording a returned check', () => {
    test.use({ role: 'finance' })
    let payer = ''
    let checkNumber = ''

    function checkEntry(page: Page) {
      return entryItem(page, `payment by check ${checkNumber}: $25.00 from ${payer}.`)
    }

    async function returnedForm(page: Page, db: E2eDb) {
      await applicationByNumber(page, db, SOURCE)
      return formWith(await openEntryControls(checkEntry(page)), 'Record returned check')
    }

    test('finance records a check payment', async ({ page, db, suffix }) => {
      payer = `Rita Check ${suffix}`
      checkNumber = `C${suffix.slice(0, 6)}`
      await applicationByNumber(page, db, SOURCE)
      await recordDeskPayment(page, { method: 'Check', amount: '25.00', payer, checkNumber })
    })

    test('a reason under 10 characters is refused beside it and no dialog opens', async ({
      page,
      db,
    }) => {
      const form = await returnedForm(page, db)
      await fillDate(form.getByLabel('Returned on'), await townToday(db))
      await form.getByLabel(REASON).fill(SHORT_REASON)
      await form.getByRole('button', { name: 'Record returned check' }).click()
      await expectRefusedBeside(form.getByLabel(REASON), REASON_REFUSAL)
      await expectNoDialog(page)
      expect(await ledgerOfType(db, payer, 'returned_check')).toEqual([])
    })

    test('a return date in the future is refused beside the date', async ({ page, db }) => {
      const form = await returnedForm(page, db)
      await fillDate(form.getByLabel('Returned on'), '2099-01-01')
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: 'Record returned check' }).click()
      await expectRefusedBeside(
        form.getByLabel('Returned on'),
        'Enter the date returned between January 1, 1900 and',
      )
      await expectNoDialog(page)
      expect(await ledgerOfType(db, payer, 'returned_check')).toEqual([])
    })

    test('a valid return opens the dialog and stores a negative returned_check row', async ({
      page,
      db,
    }) => {
      const form = await returnedForm(page, db)
      await fillDate(form.getByLabel('Returned on'), await townToday(db))
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: 'Record returned check' }).click()
      await confirmWith(page, 'Record this check as returned?', 'Record returned check')
      await expectConfirmation(page, 'Returned check recorded.')
      expect(await ledgerOfType(db, payer, 'returned_check')).toEqual([
        expect.objectContaining({
          method: 'check',
          amount_cents: -2500,
          check_number: checkNumber,
          reason: expect.stringContaining(GOOD_REASON),
        }),
      ])
    })

    test('a second return of the same check says it was already returned', async ({ page, db }) => {
      const form = await returnedForm(page, db)
      await fillDate(form.getByLabel('Returned on'), await townToday(db))
      await form.getByLabel(REASON).fill(GOOD_REASON)
      await form.getByRole('button', { name: 'Record returned check' }).click()
      await confirmWith(page, 'Record this check as returned?', 'Record returned check')
      await expect(
        form.getByText('This check has already been recorded as returned.'),
      ).toBeVisible()
      expect(await ledgerOfType(db, payer, 'returned_check')).toHaveLength(1)
    })
  })
