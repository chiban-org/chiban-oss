import { FERNHOLLOW_STORIES } from '@/features/demo/me/maineStories'
import { expect, test } from '../fixtures/test'
import { decisionIdFor, expectNoNhTerms, signInAs, storyApplicationId } from './support'

const RECEIPT_RECIPIENTS = [
  'Brackett Planning Board',
  'Brackett Town Clerk',
  'Callen, Rhodes',
  'Dunlevy, Owen',
  'Fennimore, Cyrus',
  'Sorrel Point Trust',
  'Yarrow, June',
]

const DELIVERY_ROLES = ['Agent', 'Applicant', 'Planning board', 'Municipal officers']

test.describe('Fernhollow applications', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'admin')
  })

  test('the overdue building permit is refused by operation of law', async ({ page, db }) => {
    const id = await storyApplicationId(db, FERNHOLLOW_STORIES.buildingRefused)
    await page.goto(`/staff/applications/${id}`)
    const notice = page.getByRole('region', { name: 'Written decision notice' })
    await expect(notice).toContainText(
      /Refused by operation of law on .+ \(30-A MRSA §4103\(3\)\)\./,
    )
    await expect(page.getByText('Building permit decision deadline')).toBeVisible()
    await expectNoNhTerms(page)
  })

  test('the subdivision shows its receipt notices, all proved on time', async ({ page, db }) => {
    const id = await storyApplicationId(db, FERNHOLLOW_STORIES.subdivision)
    await page.goto(`/staff/applications/${id}`)
    const receipt = page.getByRole('region', { name: 'Notices on receipt' })
    await expect(receipt).toContainText('Recorded: Town of Brackett (abutting).')
    const summary = receipt.getByText(`All ${RECEIPT_RECIPIENTS.length} notices proved on time`)
    await expect(summary).toBeVisible()
    await expectNoNhTerms(page)

    await summary.click()
    const rows = receipt
      .getByRole('table', { name: 'Notice items and their proof' })
      .locator('tbody tr')
    await expect(rows).toHaveCount(RECEIPT_RECIPIENTS.length)
    for (const name of RECEIPT_RECIPIENTS) {
      await expect(rows.filter({ hasText: name })).toContainText('On time')
    }
    await expectNoNhTerms(page)
  })

  test('the Board of Appeals variance decision is delivered to each recipient', async ({
    page,
    db,
  }) => {
    const applicationId = await storyApplicationId(db, FERNHOLLOW_STORIES.variance)
    await page.goto(`/staff/boards/decisions/${await decisionIdFor(db, applicationId)}`)
    const delivery = page.getByRole('region', { name: 'Delivery' })
    await expect(delivery).toContainText(/Due .+\./)
    const recipients = delivery.getByRole('listitem')
    await expect(recipients).toHaveCount(DELIVERY_ROLES.length)
    for (const role of DELIVERY_ROLES) {
      await expect(recipients.filter({ hasText: `${role}: ` })).toContainText(/Mailed /)
    }
    await expect(
      page
        .getByRole('list', { name: 'Appeal graph' })
        .getByText('Board of Appeals decision', { exact: true }),
    ).toBeVisible()
    await expectNoNhTerms(page)
  })
})
