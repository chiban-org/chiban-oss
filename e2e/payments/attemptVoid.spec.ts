import {
  counterJob,
  fillElectricalJob,
  licenseApplication,
  openElectricalForm,
} from '../applications/counterSupport'
import { expect, test } from '../fixtures/test'
import {
  attemptState,
  confirmWith,
  expectConfirmation,
  expectNoDialog,
  expectRefusedBeside,
} from './support'

const REASON = 'Reason (at least 10 characters)'

test.describe
  .serial('voiding an open card attempt', () => {
    let attemptId = ''

    test.describe('as staff at the counter', () => {
      test.use({ role: 'staff' })

      test('presenting the card leaves an open attempt', async ({ page, db, suffix }) => {
        const job = counterJob(suffix)
        await openElectricalForm(page)
        await fillElectricalJob(page, job)
        await page.getByLabel('Card', { exact: true }).click()
        await page.getByRole('button', { name: 'Issue and print' }).click()
        const reader = page.getByRole('region', { name: 'Card reader' })
        await expect(reader.getByRole('heading', { name: 'Present card on reader' })).toBeVisible()
        const application = await licenseApplication(db, job.license)
        const attempt = await db.one<{ id: string }>(
          `select id from payment_attempts where planned_allocations::text like '%' || $1 || '%'`,
          [application.application_id],
        )
        attemptId = attempt.id
      })

      test('staff can check with the processor but cannot void or record by hand', async ({
        page,
      }) => {
        await page.goto(`/staff/payments/${attemptId}`)
        await expect(page.getByRole('button', { name: 'Check with processor' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Void this attempt' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Record outcome' })).toHaveCount(0)
      })
    })

    test.describe('as finance', () => {
      test.use({ role: 'finance' })

      test('a void reason under 10 characters is refused beside it and no dialog opens', async ({
        page,
        db,
      }) => {
        await page.goto(`/staff/payments/${attemptId}`)
        await page.getByLabel(REASON).fill('too short')
        await page.getByRole('button', { name: 'Void this attempt' }).click()
        await expectRefusedBeside(
          page.getByLabel(REASON),
          'Enter a reason of at least 10 characters.',
        )
        await expectNoDialog(page)
        expect((await attemptState(db, attemptId)).state).toBe('pending')
      })

      test('a valid void opens the dialog and marks the attempt voided', async ({ page, db }) => {
        await page.goto(`/staff/payments/${attemptId}`)
        await page.getByLabel(REASON).fill('Customer left without paying')
        await page.getByRole('button', { name: 'Void this attempt' }).click()
        await confirmWith(page, 'Void this payment attempt?', 'Void the attempt')
        await expectConfirmation(page, 'Attempt voided.')
        expect((await attemptState(db, attemptId)).state).toBe('voided')
      })
    })
  })
