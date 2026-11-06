import { pdfText } from '@/test/pdfText'
import { daysFromToday } from '../boards/records'
import { expect, fillDate, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { logRequestViaForm, openDetails, openRequest, section } from './requestSupport'

test.use({ role: 'records' })

test.describe('first response on a Right-to-Know request', () => {
  test('a time statement with a charge shows the charge on the request page and in the letter', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Septic files for Heron Lane, ref ${suffix}`)
    await openRequest(page, id)
    const response = section(page, 'First response')
    await openDetails(response, 'Record the first response')
    await response.getByLabel('Response', { exact: true }).selectOption('time_statement')
    await fillDate(
      response.getByLabel('Date the town will respond by'),
      await daysFromToday(db, 10),
    )
    await response.getByLabel('Why more time is needed').fill(`Files are in storage, ${suffix}`)
    await response.getByLabel('Charge, if any (what it is for)').fill('Copying the septic files')
    await response.getByLabel('Charge in dollars').fill('37.50')
    await response.getByRole('button', { name: 'Record response' }).click()

    await expect(response.getByText('Estimated charge $37.50.')).toBeVisible()
    await expect(response.getByText(`Files are in storage, ${suffix}`)).toBeVisible()
    const stored = await db.one<{ first_response_kind: string; cost_estimate: unknown }>(
      `select r.first_response_kind, t.cost_estimate from rtk_requests r
       join rtk_time_statements t on t.request_id = r.id where r.id = $1`,
      [id],
    )
    expect(stored.first_response_kind).toBe('time_statement')
    expect(stored.cost_estimate).toEqual([{ label: 'Copying the septic files', cents: 3750 }])

    await page.reload()
    const letter = section(page, 'Letters').getByRole('link').first()
    const href = await letter.getAttribute('href')
    const body = await page.request.get(href ?? '')
    expect(body.ok()).toBe(true)
    const text = await pdfText(new Uint8Array(await body.body()))
    expect(text).toContain('37.50')
    expect(text).toContain('Copying the septic files')
  })

  test('refuses a time statement with no date beside the date field and records nothing', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Cemetery deeds, ref ${suffix}`)
    await openRequest(page, id)
    const response = section(page, 'First response')
    await openDetails(response, 'Record the first response')
    await response.getByLabel('Response', { exact: true }).selectOption('time_statement')
    await response.getByLabel('Why more time is needed').fill('Needs a search')
    await response.getByRole('button', { name: 'Record response' }).click()
    await expectRefusedBeside(
      response.getByLabel('Date the town will respond by'),
      'Fill in: Date the town will respond by.',
    )
    const row = await db.one<{ first_response_kind: string | null }>(
      'select first_response_kind from rtk_requests where id = $1',
      [id],
    )
    expect(row.first_response_kind).toBeNull()
  })
})
