import { createHash } from 'node:crypto'
import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './support'

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
})
