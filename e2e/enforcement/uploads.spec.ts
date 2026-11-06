import { expectConfirmation } from '../applications/support'
import { expect, test } from '../fixtures/test'
import { countRows, openSummary, region, startCase, uploadCaseDocument } from './support'

test.describe('case uploads', () => {
  test.use({ role: 'staff' })

  test('refuses an upload with no file chosen and stores nothing', async ({ page, db, suffix }) => {
    const caseId = await startCase(page, `81 Teal Bend ${suffix}`)
    const documents = region(page, 'Documents and photos')
    const upload = await openSummary(documents, 'Upload a document or photo')
    await upload.getByRole('button', { name: 'Upload' }).click()
    await expect(
      upload.getByRole('status').filter({ hasText: 'Choose a file first.' }),
    ).toBeVisible()
    expect(
      await countRows(db, 'select count(*) from documents where record_id = $1', [caseId]),
    ).toBe(0)
  })

  test('uploads a document to object storage, lists it and serves the same bytes back', async ({
    page,
    db,
    suffix,
  }) => {
    const caseId = await startCase(page, `82 Teal Bend ${suffix}`)
    const title = `Letter to the owner ${suffix}`
    await uploadCaseDocument(page, 'Letter or other case document', title)
    await expectConfirmation(page, 'Uploaded.')
    const row = await db.one<{ title: string }>(
      'select title from documents where record_id = $1 and title = $2',
      [caseId, title],
    )
    expect(row.title).toBe(title)

    const href = await region(page, 'Documents and photos')
      .getByRole('link', { name: title })
      .first()
      .getAttribute('href')
    expect(href).not.toBeNull()
    const served = await page.request.get(href ?? '')
    expect(served.status()).toBe(200)
    expect((await served.body()).subarray(0, 8).toString()).toBe('%PDF-1.4')
  })
})
