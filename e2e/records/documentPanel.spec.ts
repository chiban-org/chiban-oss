import type { Locator, Page } from '@playwright/test'
import { confirmDialog } from '../boards/confirm'
import { type E2eDb, expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast } from './requestSupport'

test.use({ role: 'staff' })

const TITLE = 'Owner letter for the Birch Lane renovation'
const APPLICATION_DOC = 'Site sketch'

async function parcelOfDocument(db: E2eDb): Promise<string> {
  const row = await db.one<{ record_id: string }>(
    "select record_id from documents where title = $1 and record_kind = 'parcel'",
    [TITLE],
  )
  return row.record_id
}

async function openDocument(page: Page, db: E2eDb) {
  await page.goto(`/staff/parcels/${await parcelOfDocument(db)}`)
  const doc = page.locator('li[data-slot="document"]').filter({ hasText: TITLE })
  await doc.locator('summary').filter({ hasText: 'Change who can see this' }).click()
  return doc
}

function whoCanSee(doc: Locator): Locator {
  return doc.getByRole('region', { name: 'Who can see this' }).locator('p').first()
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

test.describe('signed-in access on an application document', () => {
  test('saves who may open the document after signing in and says so in the sentence', async ({
    page,
    db,
  }) => {
    const row = await db.one<{ record_id: string }>(
      "select record_id from documents where title = $1 and record_kind = 'application'",
      [APPLICATION_DOC],
    )
    await page.goto(`/staff/applications/${row.record_id}`)
    const doc = page.locator('li[data-slot="document"]').filter({ hasText: APPLICATION_DOC })
    await expect(whoCanSee(doc)).toHaveText(
      'Who can see this: Town staff, project parties and assigned reviewers. Not on the public site: no copy is approved for the public yet.',
    )
    await doc.locator('summary').filter({ hasText: 'Change who can see this' }).click()
    const form = doc
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Save signed-in access' }) })
    await form.getByRole('checkbox', { name: 'Assigned reviewers' }).uncheck()
    await form.getByRole('button', { name: 'Save signed-in access' }).click()
    await expectToast(page, 'Audiences saved.')
    const saved = await db.one<{ audiences: string[] }>(
      "select audiences from documents where title = $1 and record_kind = 'application'",
      [APPLICATION_DOC],
    )
    expect(saved.audiences).toEqual(['project_parties'])
    await page.reload()
    await expect(whoCanSee(doc)).toHaveText(
      'Who can see this: Town staff and project parties. Not on the public site: no copy is approved for the public yet.',
    )
  })
})

test.describe('managing a parcel document', () => {
  test('refuses to show before a version is approved, then approves, shows, hides after confirming, and revokes after confirming', async ({
    page,
    db,
    suffix,
    pageAs,
  }) => {
    const doc = await openDocument(page, db)
    await expect(doc.getByText('Not on the public site', { exact: true })).toBeVisible()
    await expect(whoCanSee(doc)).toHaveText(
      'Who can see this: Town staff only. Not on the public site: no copy is approved for the public yet.',
    )
    const publish = doc.locator('form').filter({
      has: page.getByRole('button', { name: 'Save public site setting' }),
    })
    await expect(
      publish.getByText('Shows the approved copy to signed-out visitors on the parcel page.'),
    ).toBeVisible()
    await publish.getByRole('checkbox', { name: 'Show on the public site' }).check()
    await publish.getByRole('button', { name: 'Save public site setting' }).click()
    await expect(publish.getByRole('status').filter({ hasText: /\S/ })).toBeVisible()
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
    await expect(whoCanSee(reopened)).toHaveText(
      /^Who can see this: Town staff only\. Not on the public site\. The .+ is approved for the public, so it can be shown\.$/,
    )
    const savePublic = reopened.locator('form').filter({
      has: page.getByRole('button', { name: 'Save public site setting' }),
    })
    await savePublic.getByRole('checkbox', { name: 'Show on the public site' }).check()
    await savePublic.getByRole('button', { name: 'Save public site setting' }).click()
    await expect.poll(async () => (await documentRow(db)).is_public).toBe(true)

    const again = await openDocument(page, db)
    await expect(again.getByText('Shown on the public site', { exact: true })).toBeVisible()
    await expect(whoCanSee(again)).toHaveText(
      'Who can see this: Everyone. Shown on the public site on the parcel page, as the original.',
    )
    const parcelId = await parcelOfDocument(db)
    const seePublic = again.getByRole('link', { name: 'See what the public sees' })
    await expect(seePublic).toHaveAttribute('href', `/parcels/${parcelId}`)
    await expect(seePublic).toHaveAttribute('target', '_blank')
    const visitor = await pageAs('anonymous')
    await visitor.goto(`/parcels/${parcelId}`)
    await expect(visitor.getByText(TITLE).first()).toBeVisible()
    await visitor.context().close()

    const unpublish = again.locator('form').filter({
      has: page.getByRole('button', { name: 'Save public site setting' }),
    })
    await unpublish.getByRole('checkbox', { name: 'Show on the public site' }).uncheck()
    await unpublish.getByRole('button', { name: 'Save public site setting' }).click()
    const dialog = confirmDialog(page, `Hide ${TITLE} from the public site?`)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Hide from the public site' }).click()
    await expect.poll(async () => (await documentRow(db)).is_public).toBe(false)

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
    await expect(whoCanSee(doc)).toContainText('Who can see this: Town staff only.')
    await expect(doc.getByText('Change who can see this')).toHaveCount(0)
    await doc.locator('summary').filter({ hasText: 'Details' }).click()
    await expect(doc.getByRole('button', { name: 'Save signed-in access' })).toHaveCount(0)
    await expect(doc.getByRole('button', { name: 'Save public site setting' })).toHaveCount(0)
  })
})
