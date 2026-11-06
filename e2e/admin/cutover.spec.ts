import { createHash } from 'node:crypto'
import { expect, test } from '../fixtures/test'
import { expectConfirmation, expectRefusedBeside } from './support'

test.use({ role: 'admin' })

function csv(text: string) {
  return { name: 'cutover.csv', mimeType: 'text/csv', buffer: Buffer.from(text) }
}

test.describe('cutover import and comparison', () => {
  test('downloads the template and is told the header-only file has no rows', async ({ page }) => {
    await page.goto('/staff/admin/cutover')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download the CSV template' }).click()
    const template = await download
    expect(template.suggestedFilename()).toMatch(/\.csv$/)
    const stream = await template.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const text = Buffer.concat(chunks).toString('utf8')
    expect(text.trim().split('\n')).toHaveLength(1)
    expect(text).toContain('legacy_number')

    const file = page.locator('#cutover-file')
    await file.setInputFiles(csv(text))
    await page.getByRole('button', { name: 'Check the file' }).click()
    await expectRefusedBeside(
      file,
      'The file has a header row but no applications. Add one row per application below the header.',
    )
  })

  test('refuses a town list with no legacy numbers beside the file field', async ({ page }) => {
    await page.goto('/staff/admin/cutover')
    const file = page.locator('#cutover-list')
    await file.setInputFiles(csv('legacy_number\n'))
    await page.getByRole('button', { name: 'Compare with the list' }).click()
    await expectRefusedBeside(
      file,
      'The list has a header row but no legacy numbers. Add one legacy number per row.',
    )
  })

  test('compares a town list and the admin signs the comparison off', async ({
    page,
    db,
    suffix,
  }) => {
    const list = `legacy_number\nE2E-${suffix}\n`
    const sha = createHash('sha256').update(list).digest('hex')
    await page.goto('/staff/admin/cutover')
    await page.locator('#cutover-list').setInputFiles(csv(list))
    await page.getByRole('button', { name: 'Compare with the list' }).click()
    await expect
      .poll(
        async () =>
          (await db.rows('select 1 from cutover_reconciliations where list_sha256 = $1', [sha]))
            .length,
      )
      .toBe(1)
    await page.reload()
    await page.getByRole('button', { name: 'Sign off', exact: true }).first().click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByRole('heading', { name: 'Sign off this comparison?' })).toBeVisible()
    await confirm.getByRole('button', { name: 'Sign off this comparison' }).click()
    await expect
      .poll(
        async () =>
          (
            await db.one<{ signed: boolean }>(
              'select signed_off_at is not null as signed from cutover_reconciliations where list_sha256 = $1',
              [sha],
            )
          ).signed,
      )
      .toBe(true)
  })

  test('imports one row from a file built on the downloaded template', async ({
    page,
    db,
    suffix,
  }) => {
    const legacy = `E2E-IMPORT-${suffix}`
    const template = await page.request.get('/staff/admin/cutover/template.csv?type=BP')
    const header = (await template.text()).trim().split('\n')[0] ?? ''
    const values: Record<string, string> = {
      legacy_number: legacy,
      application_type_key: 'BP',
      parcel_id_format: 'gis12',
      parcel_id: '007001000000',
      project_title: 'Garage',
      applicant_name: 'Pat Applicant',
      state: 'submitted',
      received_date: '2026-03-02',
      'field.work_type': 'building',
      'field.description': 'Two car garage',
      'field.classification': 'residential',
      'field.dwelling_units': '1',
    }
    const row = header
      .split(',')
      .map((column) => values[column] ?? '')
      .join(',')
    await page.goto('/staff/admin/cutover')
    const file = csv(`${header}\n${row}\n`)
    await page.locator('#cutover-file').setInputFiles(file)
    await page.getByRole('button', { name: 'Check the file' }).click()
    await expectConfirmation(
      page,
      'Dry run, nothing saved: 1 would import, 0 already imported, 0 with errors.',
    )
    expect(
      await db.rows('select 1 from cutover_rows where legacy_number = $1', [legacy]),
    ).toHaveLength(0)

    await page.locator('#cutover-file').setInputFiles(file)
    await page.getByRole('button', { name: 'Import the file' }).click()
    await expectConfirmation(page, 'Imported: 1 imported, 0 already imported, 0 with errors.')
    expect(
      await db.rows('select 1 from cutover_rows where legacy_number = $1', [legacy]),
    ).toHaveLength(1)
  })
})
