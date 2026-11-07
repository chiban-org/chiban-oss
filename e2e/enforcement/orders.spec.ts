import { expect, fillDate, test } from '../fixtures/test'
import {
  caseWithOpenFinding,
  countRows,
  DEADLINE,
  draftOrderFor,
  expectConfirmation,
  expectRefusedBeside,
  formFor,
  openSummary,
  region,
} from './support'

const ORDERS = 'Cease and desist orders'
const ORDERS_FOR_CASE = 'select count(*) from enforcement_orders where case_id = $1 and status = $2'

test.describe
  .serial('drafting, revising, discarding and issuing an order', () => {
    test.use({ role: 'staff' })
    let caseId = ''

    test('refuses a draft with no finding chosen and shows the message once', async ({
      page,
      db,
      suffix,
    }) => {
      caseId = await caseWithOpenFinding(page, `44 Kestrel Run ${suffix}`)
      const orders = region(page, 'Cease and desist orders')
      await openSummary(orders, 'Draft an order')
      await fillDate(orders.getByLabel('Corrective action due'), DEADLINE)
      await orders.getByRole('button', { name: 'Draft order' }).click()
      const group = orders.getByRole('group', { name: 'Findings the order is based on' })
      await expect(group.getByText('Choose at least one finding.')).toHaveCount(1)
      await expect(orders.getByRole('checkbox').first()).toHaveAttribute('aria-invalid', 'true')
      expect(
        await countRows(db, 'select count(*) from enforcement_orders where case_id = $1', [caseId]),
      ).toBe(0)
    })

    test('drafts an order and stores it as a draft', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await draftOrderFor(page, `Remove the second kitchen, ref ${suffix}`)
      const orders = region(page, 'Cease and desist orders')
      await expect(
        orders.getByText(`Corrective action: Remove the second kitchen, ref ${suffix}`),
      ).toBeVisible()
      const row = await db.one<{ number: string; corrective_deadline: string }>(
        "select number, to_char(corrective_deadline, 'YYYY-MM-DD') as corrective_deadline from enforcement_orders where case_id = $1 and status = 'draft'",
        [caseId],
      )
      expect(row.corrective_deadline).toBe(DEADLINE)
      await expect(orders.getByRole('heading', { level: 3 })).toHaveText(`${row.number}, Draft`)
    })

    test('saves a revised draft', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const orders = region(page, 'Cease and desist orders')
      const revised = `Remove the second kitchen and meter, ref ${suffix}`
      await orders.getByRole('article').getByLabel('Corrective action required').fill(revised)
      await orders.getByRole('button', { name: 'Save the draft' }).click()
      await expectConfirmation(page, 'Draft saved.')
      const row = await db.one<{ corrective_action: string }>(
        "select corrective_action from enforcement_orders where case_id = $1 and status = 'draft'",
        [caseId],
      )
      expect(row.corrective_action).toBe(revised)
    })

    test('keeps the draft when the discard is cancelled, then discards it on confirm', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const orders = region(page, 'Cease and desist orders')
      await orders.getByRole('button', { name: 'Discard the draft' }).click()
      const dialog = page.getByRole('dialog', { name: 'Discard this draft order?' })
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toHaveCount(0)
      expect(await countRows(db, ORDERS_FOR_CASE, [caseId, 'draft'])).toBe(1)

      await orders.getByRole('button', { name: 'Discard the draft' }).click()
      await dialog.getByRole('button', { name: 'Discard the draft' }).click()
      await expectConfirmation(page, 'Draft discarded.')
      expect(await countRows(db, ORDERS_FOR_CASE, [caseId, 'withdrawn'])).toBe(1)
      expect(await countRows(db, ORDERS_FOR_CASE, [caseId, 'draft'])).toBe(0)
    })

    test('drafts a second order after the discard', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await draftOrderFor(page, `Stop renting the second dwelling, ref ${suffix}`)
      expect(await countRows(db, ORDERS_FOR_CASE, [caseId, 'draft'])).toBe(1)
    })

    test('refuses an issue date in 2099 beside the date and leaves the order a draft', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const orders = await formFor(page, ORDERS, null, 'Issue order')
      await fillDate(orders.getByLabel('Issue date'), '2099-01-01')
      await orders.getByRole('button', { name: 'Issue order' }).click()
      await expectRefusedBeside(
        orders.getByLabel('Issue date'),
        'Enter the issue date between January 1, 1900 and',
      )
      expect(await countRows(db, ORDERS_FOR_CASE, [caseId, 'draft'])).toBe(1)
    })

    test('refuses the inspector, who is not a designated officer, beside the issue date', async ({
      pageAs,
      db,
    }) => {
      const inspector = await pageAs('inspector')
      await inspector.goto(`/staff/enforcement/${caseId}`)
      const orders = await formFor(inspector, ORDERS, null, 'Issue order')
      await orders.getByRole('button', { name: 'Issue order' }).click()
      await expectRefusedBeside(
        orders.getByLabel('Issue date'),
        'You are not on record as a designated enforcement officer on the issue date.',
      )
      expect(await countRows(db, ORDERS_FOR_CASE, [caseId, 'draft'])).toBe(1)
    })

    test('issues the order as the designated clerk and stores the PDF', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await (await formFor(page, ORDERS, null, 'Issue order'))
        .getByRole('button', { name: 'Issue order' })
        .click()
      await expectConfirmation(page, 'Order issued.')
      const orders = region(page, ORDERS)
      await expect(orders.getByRole('link', { name: 'Open order' })).toBeVisible()
      await expect(orders.getByRole('heading', { level: 4, name: 'Service' })).toBeVisible()
      const row = await db.one<{
        status: string
        document_id: string | null
        issued_on: string | null
      }>(
        "select status, document_id, issued_on from enforcement_orders where case_id = $1 and status <> 'withdrawn'",
        [caseId],
      )
      expect(row.status).toBe('issued')
      expect(row.document_id).not.toBeNull()
      expect(row.issued_on).not.toBeNull()
    })
  })
