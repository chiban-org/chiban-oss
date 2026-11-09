import type { Page } from '@playwright/test'
import { expect, signInWithMagicLink, test, uniqueEmail } from '../fixtures/test'
import { draftOf, PORTAL_PARCEL_ADDRESS, startPortalApplication } from './support'

const TYPE_KEY = 'BP'
const ATTESTATION = /^I attest that the information in this application is true and complete/

const pdf = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
})

async function fillBuildingForm(page: Page, suffix: string): Promise<void> {
  await page.getByLabel('Type of work').click()
  await page.getByRole('option', { name: 'Building', exact: true }).click()
  await page.getByLabel('Description of work').fill(`Garage addition ${suffix}`)
  await page.getByLabel('Use classification').click()
  await page.getByRole('option', { name: 'Residential', exact: true }).click()
  await page.getByLabel('Number of dwelling units').fill('1')
}

async function fileOneFileForTwoItems(page: Page, suffix: string): Promise<void> {
  const documents = page.getByRole('region', { name: 'To file' })
  await documents
    .getByLabel('Choose a file for Plot plan')
    .setInputFiles(pdf(`plans-${suffix}.pdf`))
  await expect(page.getByRole('status').filter({ hasText: 'Uploaded.' })).toBeVisible()
  const drawings = documents.getByRole('listitem').filter({
    has: page.getByText('Construction drawings to scale', { exact: true }),
  })
  await drawings.getByText('Use a file you already added').click()
  await drawings
    .getByLabel(/^Use a file already added for Construction drawings to scale/)
    .selectOption({ label: 'Plot plan' })
  await drawings.getByRole('button', { name: 'Use this file' }).click()
  await expect(drawings).toContainText('Provided')
}

async function submit(page: Page): Promise<void> {
  await page.getByLabel(ATTESTATION).check()
  await page.getByRole('button', { name: 'Submit application' }).click()
}

test('an applicant files each required document, uses one file for two items, and submits', async ({
  page,
  db,
  suffix,
}) => {
  await signInWithMagicLink(page, uniqueEmail('docs', suffix))
  const applicationId = await startPortalApplication(page, PORTAL_PARCEL_ADDRESS, TYPE_KEY)
  await fillBuildingForm(page, suffix)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible()

  const notNeeded = page.locator('details').filter({ hasText: 'Not needed for this project' })
  await notNeeded.locator('summary').click()
  await expect(
    notNeeded.getByRole('listitem').filter({ hasText: 'Owner authorization' }),
  ).toContainText('Needed only if you answer “No” to “Are you the property owner?”.')
  await expect(
    page.getByText('Before you submit, add: Plot plan, Construction drawings to scale.'),
  ).toBeVisible()

  await submit(page)
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Documents not provided: Plot plan; Construction drawings to scale.' }),
  ).toBeVisible()
  expect((await draftOf(db, applicationId)).state).toBe('draft')

  await fileOneFileForTwoItems(page, suffix)
  const links = await db.rows<{ item_key: string }>(
    'select item_key from application_document_links where application_id = $1 order by item_key',
    [applicationId],
  )
  expect(links.map((l) => l.item_key)).toEqual(['construction_drawings', 'plot_plan'])

  await submit(page)
  await expect(page.getByRole('button', { name: 'Submit application' })).toHaveCount(0)
  await expect.poll(async () => (await draftOf(db, applicationId)).state).toBe('submitted')
})

test('staff accept a document item without the file and the gate stops asking for it', async ({
  page,
  pageAs,
  db,
  suffix,
}) => {
  await signInWithMagicLink(page, uniqueEmail('docs-staff', suffix))
  const applicationId = await startPortalApplication(page, PORTAL_PARCEL_ADDRESS, TYPE_KEY)
  await fillBuildingForm(page, suffix)
  await page
    .getByRole('radiogroup', { name: 'This is a new driveway or curb cut' })
    .getByRole('radio', { name: 'Yes' })
    .click()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible()
  await fileOneFileForTwoItems(page, suffix)
  await submit(page)
  await expect.poll(async () => (await draftOf(db, applicationId)).state).toBe('submitted')

  const staff = await pageAs('staff')
  await staff.goto(`/staff/applications/${applicationId}`)
  const required = staff.getByRole('region', { name: 'Required documents' })
  const driveway = required.getByRole('listitem').filter({
    has: staff.getByText('Driveway permit and E-911 address', { exact: true }),
  })
  await expect(driveway).toContainText('Missing')
  await driveway.locator('summary', { hasText: 'Accept without the document' }).click()
  await driveway
    .getByLabel(/^Why Driveway permit and E-911 address is not needed/)
    .fill(`Existing driveway permit on file ${suffix}`)
  await driveway.getByRole('button', { name: 'Accept without the document' }).click()
  await expect(driveway).toContainText(`Accepted: Existing driveway permit on file ${suffix}`)

  const accepted = await db.one<{ accepted_reason: string }>(
    `select accepted_reason from application_document_items
      where application_id = $1 and item_key = 'driveway_permit'`,
    [applicationId],
  )
  expect(accepted.accepted_reason).toBe(`Existing driveway permit on file ${suffix}`)
})
