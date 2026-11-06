import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '../fixtures/test'
import { expectConfirmation, expectRefusedBeside } from './support'

test.use({ role: 'admin' })

test.describe('data export request', () => {
  test('requests a new export and stores the request', async ({ page, db }) => {
    const before = await db.rows('select 1 from exports')
    await page.goto('/staff/admin/export')
    await page.getByRole('button', { name: 'Request a new export' }).click()
    await expectConfirmation(
      page,
      'Export requested. It is ready in a few minutes. Reload this page to see it.',
    )
    expect(await db.rows('select 1 from exports')).toHaveLength(before.length + 1)
  })
})

test.describe('export targets', () => {
  test('refuses a relative folder, then adds a folder target and turns it off and on', async ({
    page,
    db,
    suffix,
  }) => {
    const name = `E2E archive ${suffix}`
    const folder = path.join(os.tmpdir(), `chiban-e2e-export-${suffix}`)
    mkdirSync(folder, { recursive: true })
    await page.goto('/staff/admin/export/targets')
    await page.getByRole('button', { name: 'Add a target' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('A folder on the server', { exact: true }).click()
    await dialog.locator('input[name="name"]').first().fill(name)
    const root = dialog.getByLabel('Folder on the server (full path)')
    await root.fill('relative/archive')
    await dialog.getByRole('button', { name: 'Add the folder' }).click()
    await expectRefusedBeside(root, 'Enter the full path of the folder, starting with /.')
    expect(await db.rows('select 1 from export_targets where name = $1', [name])).toHaveLength(0)

    await root.fill(folder)
    await dialog.getByRole('button', { name: 'Add the folder' }).click()
    await expectConfirmation(page, 'Saved. Reload this page to see it in the list.')
    expect(await db.rows('select 1 from export_targets where name = $1', [name])).toHaveLength(1)

    await page.goto('/staff/admin/export/targets')
    const item = page.getByRole('listitem').filter({ hasText: name })
    await item.getByRole('button', { name: 'Turn off' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Turn it off' }).click()
    await expectConfirmation(page, 'Turned off.')
    await item.getByRole('button', { name: 'Turn on' }).click()
    await expectConfirmation(page, 'Turned on.')
    await item.getByRole('button', { name: 'Run now' }).click()
    await expectConfirmation(page, 'Requested. The copy starts within a minute or two.')
  })
})
