import { expectRefusedBeside } from '../applications/support'
import { expect, signInWithMagicLink, test, uniqueEmail } from '../fixtures/test'
import { draftOf, PORTAL_PARCEL_ADDRESS, startPortalApplication } from './support'

const TYPE_LABEL = 'Driveway permit'
const ATTESTATION = /^I attest that the information in this application is true and complete/

test('an applicant keeps one draft per parcel, saves it, uploads the driveway sketch and submits it', async ({
  page,
  db,
  suffix,
}) => {
  const email = uniqueEmail('draft', suffix)
  await signInWithMagicLink(page, email)

  const applicationId = await startPortalApplication(page, PORTAL_PARCEL_ADDRESS, TYPE_LABEL)
  const again = await startPortalApplication(page, PORTAL_PARCEL_ADDRESS, TYPE_LABEL)
  expect(again).toBe(applicationId)
  const drafts = await db.rows<{ id: string }>(
    `select id from applications
      where created_by = (select id from users where email = $1) and state = 'draft'`,
    [email],
  )
  expect(drafts.map((row) => row.id)).toEqual([applicationId])

  const description = page.getByLabel(/^Description/)
  const road = page.getByLabel(/^Road the driveway meets/)
  await description.fill(`Gravel driveway ${suffix}`)
  await road.fill('Tamarack Way')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible()
  expect(await draftOf(db, applicationId)).toMatchObject({
    state: 'draft',
    values: { description: `Gravel driveway ${suffix}`, road_name: 'Tamarack Way' },
  })

  await page.getByLabel('Choose a file for Driveway sketch').setInputFiles({
    name: `site-plan-${suffix}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  })
  await expect(page.getByRole('status').filter({ hasText: 'Uploaded.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Driveway sketch' })).toBeVisible()
  const stored = await db.one<{ item_key: string }>(
    `select l.item_key from documents d
       join application_document_links l on l.document_id = d.id
      where d.record_id = $1 and d.title = 'Driveway sketch'`,
    [applicationId],
  )
  expect(stored.item_key).toBe('driveway_sketch')

  await description.fill('   ')
  await page.getByLabel(ATTESTATION).check()
  await page.getByRole('button', { name: 'Submit application' }).click()
  await expectRefusedBeside(description, 'This is required.')
  expect((await draftOf(db, applicationId)).state).toBe('draft')

  await description.fill(`Gravel driveway ${suffix}`)
  await page.getByRole('button', { name: 'Submit application' }).click()
  await expect(page.getByRole('button', { name: 'Submit application' })).toHaveCount(0)
  await expect.poll(async () => (await draftOf(db, applicationId)).state).not.toBe('draft')
})
