import { expect, test } from '../fixtures/test'
import { expectFormStatus } from './confirmation'
import { applicationIdFor } from './records'
import { expectRefused } from './refusal'
import { uploadPdf } from './upload'

const APPLICATION = 'Bittern Meadow site plan'

test.describe
  .serial('regional transmittal of a filed decision', () => {
    test.use({ role: 'staff' })
    let decisionId: string
    let receiptTitle: string

    test('checks the transmittal and says proof is still needed', async ({ page, db, suffix }) => {
      receiptTitle = `Certified mail receipt ${suffix}`
      const row = await db.one<{ id: string }>(
        'select id from board_decisions where application_id = $1',
        [await applicationIdFor(db, APPLICATION)],
      )
      decisionId = row.id
      await page.goto(`/staff/boards/decisions/${decisionId}`)
      await page.getByRole('button', { name: 'Check the transmittal' }).click()
      await expectFormStatus(
        page,
        'Transmittal checklist is ready. Record proof for each recipient.',
      )
    })

    test('refuses transmittal proof before a receipt is chosen', async ({ page }) => {
      await page.goto(`/staff/boards/decisions/${decisionId}`)
      await page.locator('summary', { hasText: 'Record proof of transmittal' }).click()
      await page.getByRole('button', { name: 'Record proof' }).click()
      await expectRefused(
        page.locator('#record-transmittal').getByLabel(/^Certificate or receipt/),
        'Fill in:',
      )
    })

    test('uploads the receipt and records proof for every recipient', async ({ page, db }) => {
      await page.goto(`/staff/boards/decisions/${decisionId}`)
      await page.locator('summary', { hasText: 'Record proof of transmittal' }).click()
      const form = page.locator('#record-transmittal')
      await uploadPdf(form, 'Upload a certified mail receipt', receiptTitle)
      const boxes = form
        .getByRole('group', { name: 'Recipients this proof covers' })
        .getByRole('checkbox')
      const count = await boxes.count()
      expect(count).toBeGreaterThan(0)
      for (let i = 0; i < count; i += 1) await boxes.nth(i).check()
      await form.getByLabel('Tracking number').fill('RR 2002')
      await form.getByLabel(/^Certificate or receipt/).selectOption({ label: receiptTitle })
      await form.getByRole('button', { name: 'Record proof' }).click()
      await expect
        .poll(
          async () =>
            (
              await db.rows(
                `select 1 from notice_proofs p join documents d on d.id = p.document_id
               where d.title = $1`,
                [receiptTitle],
              )
            ).length,
        )
        .toBe(count)
    })
  })
