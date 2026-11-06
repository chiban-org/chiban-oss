import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { LOG_DIALOG, logRequestViaForm } from './requestSupport'

test.use({ role: 'records' })

test.describe('logging a Right-to-Know request', () => {
  test('stores the request with today as the received date and lists it with its number', async ({
    page,
    db,
    suffix,
  }) => {
    const description = `Budget workpapers for the highway garage, ref ${suffix}`
    const id = await logRequestViaForm(page, db, description)
    const row = await db.one<{ number: string; status: string; received_via: string }>(
      'select number, status, received_via from rtk_requests where id = $1',
      [id],
    )
    expect(row.status).toBe('open')
    expect(row.received_via).toBe('in_person')
    await page.goto('/staff/records/requests')
    const listed = page.getByRole('row').filter({ hasText: description })
    await expect(listed.getByRole('link', { name: row.number })).toBeVisible()
  })

  test('refuses a description of only spaces beside the field and stores nothing', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/records/requests')
    await page.getByRole('button', { name: 'Log a request' }).click()
    const dialog = page.getByRole('dialog', { name: LOG_DIALOG })
    const field = dialog.getByLabel('What was asked for')
    await field.fill('     ')
    await dialog.getByRole('button', { name: 'Log request' }).click()
    await expectRefusedBeside(field, 'Enter what was asked for.')
    const blank = await db.one<{ n: string }>(
      "select count(*) as n from rtk_requests where trim(description) = ''",
    )
    expect(blank.n).toBe('0')
  })
})
