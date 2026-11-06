import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import { expectConfirmation, expectRefusedBeside } from './support'

test.use({ role: 'admin' })

async function openAddDialog(page: Page, summary: string) {
  await page.goto('/staff/admin/export/targets')
  await page.getByRole('button', { name: 'Add a target' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText(summary, { exact: true }).click()
  return dialog
}

test.describe('export target kinds', () => {
  test('refuses an S3 address that is not a web address, then saves the bucket', async ({
    page,
    db,
    suffix,
  }) => {
    const name = `E2E bucket ${suffix}`
    const dialog = await openAddDialog(page, 'An S3 bucket')
    await dialog.locator('#add-s3-name').fill(name)
    const endpoint = dialog.locator('#add-s3-endpoint')
    await endpoint.fill('not a web address')
    await dialog.locator('#add-s3-bucket').fill('town-archive')
    await dialog.locator('#add-s3-region').fill('us-east-1')
    await dialog.locator('#add-s3-accessKeyId').fill('E2E-NOT-A-KEY')
    await dialog.locator('#add-s3-secretAccessKey').fill('e2e-not-a-secret')
    await dialog.getByRole('button', { name: 'Add the bucket' }).click()
    await expectRefusedBeside(
      endpoint,
      'Enter the storage address as a web address starting with https://.',
    )
    expect(await db.rows('select 1 from export_targets where name = $1', [name])).toHaveLength(0)

    await endpoint.fill('https://storage.example.org')
    await dialog.locator('#add-s3-accessKeyId').fill('E2E-NOT-A-KEY')
    await dialog.locator('#add-s3-secretAccessKey').fill('e2e-not-a-secret')
    await dialog.getByRole('button', { name: 'Add the bucket' }).click()
    await expectConfirmation(page, 'Saved. Reload this page to see it in the list.')
    const saved = await db.one<{ kind: string; settings: { bucket: string } }>(
      'select kind, settings from export_targets where name = $1',
      [name],
    )
    expect(saved.kind).toBe('s3')
    expect(saved.settings.bucket).toBe('town-archive')
  })

  test('refuses a malformed OneDrive tenant ID, then saves the drive', async ({
    page,
    db,
    suffix,
  }) => {
    const name = `E2E drive ${suffix}`
    const dialog = await openAddDialog(page, 'A OneDrive or SharePoint drive')
    await dialog.locator('#add-onedrive-name').fill(name)
    const tenant = dialog.locator('#add-onedrive-tenantId')
    await tenant.fill('not a tenant')
    await dialog.locator('#add-onedrive-clientId').fill('22222222-3333-4444-5555-666666666666')
    await dialog.locator('#add-onedrive-driveId').fill('b!e2e-drive')
    await dialog.locator('#add-onedrive-clientSecret').fill('e2e-not-a-secret')
    await dialog.getByRole('button', { name: 'Add the drive' }).click()
    await expectRefusedBeside(tenant, 'The Microsoft 365 tenant ID must be a GUID')
    expect(await db.rows('select 1 from export_targets where name = $1', [name])).toHaveLength(0)

    await tenant.fill('11111111-2222-3333-4444-555555555555')
    await dialog.locator('#add-onedrive-clientSecret').fill('e2e-not-a-secret')
    await dialog.getByRole('button', { name: 'Add the drive' }).click()
    await expectConfirmation(page, 'Saved. Reload this page to see it in the list.')
    const saved = await db.one<{ kind: string }>(
      'select kind from export_targets where name = $1',
      [name],
    )
    expect(saved.kind).toBe('onedrive')
  })
})
