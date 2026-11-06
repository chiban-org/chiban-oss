import { expect, test } from '../fixtures/test'
import {
  attemptState,
  confirmWith,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
  seededAttemptId,
} from './support'

const PERMIT = 'PL-2026-0002'
const NOTE = 'Note (at least 10 characters)'
const OUTCOME = 'What the processor confirmed'
const APPROVED = 'Processor confirms approved'

test.describe
  .serial('a card attempt the processor never confirmed', () => {
    test.use({ role: 'finance' })
    let attemptId = ''

    test('checking with the processor reports the attempt state', async ({ page, db }) => {
      attemptId = await seededAttemptId(db, PERMIT)
      await page.goto(`/staff/payments/${attemptId}`)
      await page.getByRole('button', { name: 'Check with processor' }).click()
      await expectConfirmation(page, 'The processor reports this attempt as')
      expect((await attemptState(db, attemptId)).manual_outcome).toBeNull()
    })

    test('an outcome note under 10 characters is refused beside it and no dialog opens', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/payments/${attemptId}`)
      await page.getByLabel(OUTCOME).selectOption({ label: APPROVED })
      await page.getByLabel(NOTE).fill('too short')
      await page.getByRole('button', { name: 'Record outcome' }).click()
      await expectRefusedBeside(page.getByLabel(NOTE), 'Enter a note of at least 10 characters.')
      await expectNoDialog(page)
      expect((await attemptState(db, attemptId)).manual_outcome).toBeNull()
    })

    test('recording approved by hand puts the payment in the ledger', async ({ page, db }) => {
      await page.goto(`/staff/payments/${attemptId}`)
      await page.getByLabel(OUTCOME).selectOption({ label: APPROVED })
      await page.getByLabel(NOTE).fill('Confirmed by phone with the processor')
      await page.getByRole('button', { name: 'Record outcome' }).click()
      await confirmWith(page, 'Record this outcome by hand?', 'Record the outcome')
      await expectConfirmation(page, 'Recorded as approved. The payment is in the ledger.')
      expect(await attemptState(db, attemptId)).toEqual({
        state: 'captured',
        manual_outcome: 'approved',
      })
      const rows = await db.rows<{ entry_type: string; amount_cents: number }>(
        'select entry_type, amount_cents from ledger_entries where payment_attempt_id = $1',
        [attemptId],
      )
      expect(rows.map((row) => row.entry_type)).toEqual(['payment'])
      expect(rows[0]?.amount_cents).toBeGreaterThan(0)
    })
  })
