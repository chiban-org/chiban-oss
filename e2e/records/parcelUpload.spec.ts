import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import { parcelIdOfGis } from './parcelSupport'

test.use({ role: 'staff' })

const PARCEL_GIS = '007021000000'

function pdf(title: string): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name: `${title}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% ${title}\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n`),
  }
}

async function openUploader(page: Page, parcelId: string): Promise<Locator> {
  await page.goto(`/staff/parcels/${parcelId}`)
  const uploader = page
    .getByRole('region', { name: 'Documents' })
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Add a parcel file' }) })
  await uploader.locator('summary').click()
  return uploader
}

async function chooseFirstSeries(page: Page, panel: Locator): Promise<void> {
  await panel.getByRole('combobox', { name: 'Record series' }).click()
  await page.getByRole('option').first().click()
}

test.describe('uploading a parcel file', () => {
  test('offers no upload until a record series is chosen', async ({ page, db }) => {
    const panel = await openUploader(page, await parcelIdOfGis(db, PARCEL_GIS))
    await expect(
      panel.getByText('Choose a record series before uploading a parcel file.'),
    ).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Upload', exact: true })).toHaveCount(0)
  })

  test('reports an empty file as empty and stores nothing', async ({ page, db }) => {
    const parcelId = await parcelIdOfGis(db, PARCEL_GIS)
    const panel = await openUploader(page, parcelId)
    await chooseFirstSeries(page, panel)
    await panel
      .getByLabel('File', { exact: true })
      .setInputFiles({ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })
    await panel.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(panel.getByText('That file is empty. Choose a file with content.')).toBeVisible()
    const rows = await db.rows(
      "select 1 from documents where record_id = $1 and title = 'empty.pdf'",
      [parcelId],
    )
    expect(rows).toHaveLength(0)
  })

  test('uploads a PDF to storage, lists it on the parcel and serves the same bytes back', async ({
    page,
    db,
    suffix,
  }) => {
    const parcel = await db.one<{ record_id: string }>(
      "select record_id from documents where title = 'Owner letter for the Birch Lane renovation' and record_kind = 'parcel'",
    )
    const parcelId = parcel.record_id
    const title = `Septic design, ${suffix}`
    const panel = await openUploader(page, parcelId)
    await chooseFirstSeries(page, panel)
    const file = pdf(`septic-${suffix}`)
    await panel.getByLabel('File', { exact: true }).setInputFiles(file)
    await panel.getByLabel('Name for this document').fill(title)
    await panel.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(panel.getByText('Uploaded.', { exact: true })).toBeVisible()

    const stored = await db.one<{ id: string; record_kind: string }>(
      'select id, record_kind from documents where record_id = $1 and title = $2',
      [parcelId, title],
    )
    expect(stored.record_kind).toBe('parcel')
    await expect(page.getByRole('link', { name: title })).toBeVisible()
    const served = await page.request.get(`/api/documents/${stored.id}`)
    expect(served.ok()).toBe(true)
    expect((await served.body()).equals(file.buffer)).toBe(true)
  })
})

test.describe('parcel files as an inspector', () => {
  test.use({ role: 'inspector' })

  test('sees no way to add a parcel file', async ({ page, db }) => {
    await page.goto(`/staff/parcels/${await parcelIdOfGis(db, PARCEL_GIS)}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Add a parcel file')).toHaveCount(0)
  })
})
