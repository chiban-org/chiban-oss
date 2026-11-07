import { expect, test } from '../fixtures/test'
import {
  caseAt,
  countRows,
  expectConfirmation,
  expectRefusedBeside,
  formFor,
  named,
  openSummary,
  region,
  uploadCaseDocument,
} from './support'

const MILL_BROOK = '41 Mill Brook Lane'
const COURT = 'District Court, Alder Pond Division'
const ORDERS = 'Cease and desist orders'
const STEPS =
  'select count(*) from order_court_steps s join enforcement_orders o on o.id = s.order_id where o.case_id = $1 and s.docket = $2'

test.describe
  .serial('court steps on an order served by posting and publication', () => {
    test.use({ role: 'staff' })
    let caseId = ''
    let docket = ''
    let documentTitle = ''

    test('refuses a judgment with no result chosen beside the result field', async ({
      page,
      db,
      suffix,
    }) => {
      caseId = await caseAt(db, MILL_BROOK)
      docket = `2026-CV-${suffix}`
      documentTitle = `Filed order ${suffix}`
      await page.goto(`/staff/enforcement/${caseId}`)
      await uploadCaseDocument(page, 'Court document', documentTitle)
      const form = await formFor(page, ORDERS, 'Record a court step', 'Record court step')
      await form.getByLabel('Step').selectOption({ label: 'Judgment entered' })
      await named(form, 'court').fill(COURT)
      await form.getByLabel('Docket number').fill(docket)
      await form.getByLabel('Court document').selectOption({ label: documentTitle })
      await form.getByRole('button', { name: 'Record court step' }).click()
      await expectRefusedBeside(form.getByLabel('Judgment result'), 'Choose the judgment result.')
      expect(await countRows(db, STEPS, [caseId, docket])).toBe(0)
    })

    test('records the order as filed with the clerk', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record a court step', 'Record court step')
      await named(form, 'court').fill(COURT)
      await form.getByLabel('Docket number').fill(docket)
      await form.getByLabel('Court document').selectOption({ label: documentTitle })
      await form.getByRole('button', { name: 'Record court step' }).click()
      await expectConfirmation(page, 'Court step recorded.')
      await expect(
        region(page, ORDERS).getByText(`Filed with the court clerk, ${COURT}, docket ${docket}.`),
      ).toBeVisible()
      expect(await countRows(db, STEPS, [caseId, docket])).toBe(1)
    })
  })
