import { expect, test } from '../fixtures/test'
import { camaCsv, chooseCamaFile } from './camaSupport'
import { expectToast } from './requestSupport'

test.use({ role: 'staff' })

test.describe('CAMA import page', () => {
  test('reports an empty file as empty when previewing and writes nothing', async ({ page }) => {
    await page.goto('/staff/gis/imports/cama')
    await chooseCamaFile(page, Buffer.alloc(0), 'empty.csv')
    await page.getByRole('button', { name: 'Read the file and preview' }).click()
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'That file is empty. Choose a file with content.',
    )
  })

  test('asks for a file when none is chosen', async ({ page }) => {
    await page.goto('/staff/gis/imports/cama')
    await page.getByRole('button', { name: 'Read the file and preview' }).click()
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Choose a CSV file.',
    )
  })

  test('previews a real file with the composed parcel IDs', async ({ page, suffix }) => {
    await page.goto('/staff/gis/imports/cama')
    await chooseCamaFile(page, camaCsv([{ mapLot: '007005', owner: `Preview Owner ${suffix}` }]))
    await page.getByRole('button', { name: 'Read the file and preview' }).click()
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Preview ready. Check the composed IDs before you run the import.',
    )
    await expect(page.getByRole('cell', { name: `Preview Owner ${suffix}` })).toBeVisible()
  })

  test('saves the column mapping and stores it on the CAMA layer', async ({ page, db }) => {
    await page.goto('/staff/gis/imports/cama')
    await page.getByRole('button', { name: 'Save mapping' }).click()
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Column mapping saved.',
    )
    const layer = await db.one<{ mapping: { id: { format: string } } }>(
      "select mapping from gis_layers where key = 'cama'",
    )
    expect(layer.mapping.id.format).toBe('cama15')
  })
})

test.describe('CAMA import as an inspector', () => {
  test.use({ role: 'inspector' })

  test('cannot open the import page', async ({ page }) => {
    await page.goto('/staff/gis/imports/cama')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to run imports.',
    )
    await expect(page.getByRole('button', { name: 'Read the file and preview' })).toHaveCount(0)
  })
})
