import type { Page } from '@playwright/test'
import { confirmDialog } from '../boards/confirm'
import { type E2eDb, expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast } from './requestSupport'

test.use({ role: 'staff' })

const TITLE = 'Owner letter for the Birch Lane renovation'

async function openDocument(page: Page, db: E2eDb) {
  const row = await db.one<{ record_id: string }>(
    "select record_id from documents where title = $1 and record_kind = 'parcel'",
    [TITLE],
  )
  await page.goto(`/staff/parcels/${row.record_id}`)
  const doc = page.locator('li[data-slot="document"]').filter({ hasText: TITLE })
  await doc.locator('summary').filter({ hasText: 'Manage' }).click()
  return doc
}

async function redactedVersions(db: E2eDb): Promise<number> {
  const row = await db.one<{ n: string }>(
    `select count(*) as n from document_versions v join documents d on d.id = v.document_id
     where d.title = $1 and v.role = 'public_redacted'`,
    [TITLE],
  )
  return Number(row.n)
}

async function documentRow(db: E2eDb) {
  return await db.one<{ is_public: boolean; audiences: string[] }>(
    'select is_public, audiences from documents where title = $1',
    [TITLE],
  )
}

test.describe('managing a parcel document', () => {
  test('saves who may see the document beyond the public', async ({ page, db }) => {
    const doc = await openDocument(page, db)
    const form = doc
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Save audiences' }) })
    await form.getByRole('checkbox').first().check()
    await form.getByRole('button', { name: 'Save audiences' }).click()
    await expectToast(page, 'Audiences saved.')
    expect((await documentRow(db)).audiences).toHaveLength(1)
  })

  test('refuses to publish before a version is approved, then approves, publishes, unpublishes after confirming, and revokes after confirming', async ({
    page,
    db,
    suffix,
  }) => {
    const doc = await openDocument(page, db)
    const publish = doc.locator('form').filter({
      has: page.getByRole('button', { name: 'Save public setting' }),
    })
    await publish.getByRole('checkbox', { name: 'Public' }).check()
    await publish.getByRole('button', { name: 'Save public setting' }).click()
    await expect(publish.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Approve a version for the public before showing this document on the public site.',
    )
    expect((await documentRow(db)).is_public).toBe(false)

    const approve = doc.locator('form').filter({
      has: page.getByRole('button', { name: 'Approve for the public' }),
    })
    const statement = approve.getByLabel('What you checked before approving')
    await approve.getByRole('button', { name: 'Approve for the public' }).click()
    await expectRefusedBeside(statement, 'Fill in: What you checked before approving.')
    await approve.getByLabel('Version to approve').selectOption({ index: 0 })
    await statement.fill(`Read every page, ${suffix}`)
    await approve.getByRole('button', { name: 'Approve for the public' }).click()
    await expectToast(page, 'Version approved.')

    const reopened = await openDocument(page, db)
    const savePublic = reopened.locator('form').filter({
      has: page.getByRole('button', { name: 'Save public setting' }),
    })
    await savePublic.getByRole('checkbox', { name: 'Public' }).check()
    await savePublic.getByRole('button', { name: 'Save public setting' }).click()
    await expectToast(page, 'The document is public.')
    expect((await documentRow(db)).is_public).toBe(true)

    const again = await openDocument(page, db)
    const unpublish = again.locator('form').filter({
      has: page.getByRole('button', { name: 'Save public setting' }),
    })
    await unpublish.getByRole('checkbox', { name: 'Public' }).uncheck()
    await unpublish.getByRole('button', { name: 'Save public setting' }).click()
    const dialog = confirmDialog(page, `Take ${TITLE} off the public site?`)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Make it private' }).click()
    await expectToast(page, 'The document is not public.')
    expect((await documentRow(db)).is_public).toBe(false)

    const last = await openDocument(page, db)
    const revoke = last.locator('form').filter({
      has: page.getByRole('button', { name: 'Revoke the approval' }),
    })
    const reason = revoke.getByLabel('Why it is being revoked')
    const revokeDialog = confirmDialog(page, `Revoke the approval of ${TITLE}?`)
    await revoke.getByRole('button', { name: 'Revoke the approval' }).click()
    await expectRefusedBeside(reason, 'Fill in: Why it is being revoked.')
    await expect(revokeDialog).toHaveCount(0)
    await reason.fill(`Wrong version approved, ${suffix}`)
    await revoke.getByRole('button', { name: 'Revoke the approval' }).click()
    await revokeDialog.getByRole('button', { name: 'Revoke the approval' }).click()
    await expectToast(page, 'Approval revoked. The version is no longer served anywhere.')
  })
})

test.describe('uploading a redacted copy', () => {
  test('stores the file as a redacted version of the document', async ({ page, db, suffix }) => {
    const before = await redactedVersions(db)
    const doc = await openDocument(page, db)
    await doc.locator('summary').filter({ hasText: 'Upload redacted copy' }).click()
    const uploader = doc.locator('details').filter({ hasText: 'Upload redacted copy' })
    await uploader.getByLabel('File', { exact: true }).setInputFiles({
      name: `redacted-${suffix}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        `%PDF-1.4\n% redacted ${suffix}\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n`,
      ),
    })
    await uploader.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(uploader.getByText('Uploaded.', { exact: true })).toBeVisible()
    expect(await redactedVersions(db)).toBe(before + 1)
  })
})

test.describe('managing a parcel document as an inspector', () => {
  test.use({ role: 'inspector' })

  test('sees details only, with none of the document forms', async ({ page, db }) => {
    const row = await db.one<{ record_id: string }>(
      "select record_id from documents where title = $1 and record_kind = 'parcel'",
      [TITLE],
    )
    await page.goto(`/staff/parcels/${row.record_id}`)
    const doc = page.locator('li[data-slot="document"]').filter({ hasText: TITLE })
    await doc.locator('summary').filter({ hasText: 'Details' }).click()
    await expect(doc.getByRole('button', { name: 'Save audiences' })).toHaveCount(0)
    await expect(doc.getByRole('button', { name: 'Save public setting' })).toHaveCount(0)
  })
})
