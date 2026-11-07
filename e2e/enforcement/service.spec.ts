import { expect, fillDate, test } from '../fixtures/test'
import {
  countRows,
  expectConfirmation,
  expectRefusedBeside,
  formFor,
  issuedOrderCase,
  named,
  openSummary,
  region,
  uploadCaseDocument,
} from './support'

const FUTURE = '2099-01-01'
const ORDERS = 'Cease and desist orders'

test.describe
  .serial('service on an issued order', () => {
    test.use({ role: 'staff' })
    let caseId = ''
    let ownerName = ''

    test('lists a recipient for the order and stores the source', async ({ page, db, suffix }) => {
      caseId = await issuedOrderCase(
        page,
        `51 Plover Cut ${suffix}`,
        `Stop the rental, ref ${suffix}`,
      )
      ownerName = `Pat Plover ${suffix}`
      const form = await formFor(page, ORDERS, 'Add a recipient', 'Add recipient')
      await named(form, 'name').fill(ownerName)
      await form.getByLabel('Address').fill('PO Box 9, Alder Pond NH')
      await form.getByLabel(/^Where the name came from/).fill('CAMA owner')
      await form.getByRole('button', { name: 'Add recipient' }).click()
      await expectConfirmation(page, 'Recipient added.')
      const row = await db.one<{ role: string; source: string }>(
        'select r.role, r.source from order_service_recipients r join enforcement_orders o on o.id = r.order_id where o.case_id = $1 and r.name = $2',
        [caseId, ownerName],
      )
      expect(row).toEqual({ role: 'record_owner', source: 'CAMA owner' })
    })

    test('refuses a role check dated 2099 beside the date and records a valid one', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record the check for a role', 'Record check')
      await form.getByLabel('Role').selectOption({ label: 'Taxpayer' })
      await form.getByLabel('Result').selectOption({ label: 'Same as the owner' })
      await form.getByLabel('What was searched').fill(`Tax bill goes to the owner, ref ${suffix}`)
      await fillDate(form.getByLabel('Date checked'), FUTURE)
      await form.getByRole('button', { name: 'Record check' }).click()
      await expectRefusedBeside(
        form.getByLabel('Date checked'),
        'Enter the date checked between January 1, 1900 and',
      )
      const checks = 'select count(*) from order_service_role_checks where basis like $1'
      expect(await countRows(db, checks, [`%ref ${suffix}`])).toBe(0)
    })

    test('records a role check', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record the check for a role', 'Record check')
      await form.getByLabel('Role').selectOption({ label: 'Taxpayer' })
      await form.getByLabel('Result').selectOption({ label: 'Same as the owner' })
      await form.getByLabel('What was searched').fill(`Tax bill goes to the owner, ref ${suffix}`)
      await form.getByRole('button', { name: 'Record check' }).click()
      await expectConfirmation(page, 'Check recorded.')
      const checks = 'select count(*) from order_service_role_checks where basis like $1'
      expect(await countRows(db, checks, [`%ref ${suffix}`])).toBe(1)
    })

    test('refuses a role check outcome that does not fit the role beside the result', async ({
      page,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record the check for a role', 'Record check')
      await form.getByLabel('Role').selectOption({ label: 'Owner of record' })
      await form.getByLabel('Result').selectOption({ label: 'None exist' })
      await form.getByLabel('What was searched').fill(`Not allowed, ref ${suffix}`)
      await form.getByRole('button', { name: 'Record check' }).click()
      await expectRefusedBeside(
        form.getByLabel('Result'),
        'That result is not allowed for this role.',
      )
    })

    test('refuses hand service with no proof beside the proof field', async ({ page, db }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record service', 'Record service')
      await form.getByLabel('Recipient').selectOption({ label: `${ownerName}, Owner of record` })
      await form.getByLabel('Served by (name)').fill('Deputy Marsh')
      await form.getByLabel('Server is a').selectOption({ label: 'Deputy sheriff' })
      await form.getByRole('button', { name: 'Record service' }).click()
      await expectRefusedBeside(
        form.getByLabel('Proof of service'),
        'Upload the proof first, then choose it here.',
      )
      expect(
        await countRows(
          db,
          'select count(*) from order_service_events e join enforcement_orders o on o.id = e.order_id where o.case_id = $1',
          [caseId],
        ),
      ).toBe(0)
    })

    test('uploads the proof and records service with it', async ({ page, db, suffix }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await uploadCaseDocument(page, 'Proof of service', `Return of service ${suffix}`)
      const form = await formFor(page, ORDERS, 'Record service', 'Record service')
      await form.getByLabel('Recipient').selectOption({ label: `${ownerName}, Owner of record` })
      await form.getByLabel('Served by (name)').fill('Deputy Marsh')
      await form.getByLabel('Server is a').selectOption({ label: 'Deputy sheriff' })
      await form
        .getByLabel('Proof of service')
        .selectOption({ label: `Return of service ${suffix}` })
      await form.getByRole('button', { name: 'Record service' }).click()
      await expectConfirmation(page, 'Service recorded.')
      const row = await db.one<{ method: string; server_name: string }>(
        'select e.method, e.server_name from order_service_events e join enforcement_orders o on o.id = e.order_id where o.case_id = $1',
        [caseId],
      )
      expect(row).toEqual({ method: 'in_hand', server_name: 'Deputy Marsh' })
    })

    test('uploads the proof inside the service form, which then chooses it', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record service', 'Record service')
      const upload = await openSummary(form, 'Upload the proof of service')
      await upload.getByLabel('File', { exact: true }).setInputFiles({
        name: 'return.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
      })
      await upload.getByLabel('Name for this document').fill(`Second return ${suffix}`)
      await upload.getByRole('button', { name: 'Upload' }).click()
      const proof = form.getByLabel('Proof of service')
      await expect(proof.locator('option:checked')).toHaveText(`Second return ${suffix}`)
      await form.getByLabel('Recipient').selectOption({ label: `${ownerName}, Owner of record` })
      await form.getByLabel('Served by (name)').fill('Deputy Marsh')
      await form.getByLabel('Server is a').selectOption({ label: 'Deputy sheriff' })
      await form.getByRole('button', { name: 'Record service' }).click()
      await expectConfirmation(page, 'Service recorded.')
      expect(
        await countRows(
          db,
          'select count(*) from order_service_events e join enforcement_orders o on o.id = e.order_id where o.case_id = $1',
          [caseId],
        ),
      ).toBe(2)
    })

    test('asks for the newspaper only when the method is publication', async ({ page }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record service', 'Record service')
      await expect(form.getByLabel('Server is a')).toBeVisible()
      await expect(form.getByLabel('Newspaper')).toHaveCount(0)
      await form.getByLabel('Method').selectOption({ label: 'Published in a newspaper' })
      await expect(form.getByLabel('Newspaper')).toBeVisible()
      await expect(form.getByLabel('Server is a')).toHaveCount(0)
    })

    test('records an answer from the served recipient with an uploaded document', async ({
      page,
      db,
      suffix,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      await uploadCaseDocument(page, 'Letter or other case document', `Answer letter ${suffix}`)
      const orders = region(page, 'Cease and desist orders')
      const form = await openSummary(orders, 'Record an answer')
      await form.getByLabel('Who answered').selectOption({ label: ownerName })
      await form
        .getByLabel('The answer document')
        .selectOption({ label: `Answer letter ${suffix}` })
      await form.getByRole('button', { name: 'Record answer' }).click()
      await expectConfirmation(page, 'Answer recorded.')
      await expect(orders.getByText(/^Answer received /)).toBeVisible()
      const row = await db.one<{ answer_document_id: string | null }>(
        'select answer_document_id from order_service_recipients r join enforcement_orders o on o.id = r.order_id where o.case_id = $1 and r.name = $2',
        [caseId, ownerName],
      )
      expect(row.answer_document_id).not.toBeNull()
    })

    test('refuses a court step with no court document beside the document field', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/enforcement/${caseId}`)
      const form = await formFor(page, ORDERS, 'Record a court step', 'Record court step')
      await named(form, 'court').fill('District Court, Alder Pond Division')
      await form.getByRole('button', { name: 'Record court step' }).click()
      await expectRefusedBeside(
        form.getByLabel('Court document'),
        'Choose the court document. Upload it above the form if it is not listed.',
      )
      expect(
        await countRows(
          db,
          'select count(*) from order_court_steps s join enforcement_orders o on o.id = s.order_id where o.case_id = $1',
          [caseId],
        ),
      ).toBe(0)
    })
  })
