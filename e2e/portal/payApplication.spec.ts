import { expect, signInWithMagicLink, test, uniqueEmail } from '../fixtures/test'
import { draftOf, PORTAL_PARCEL_ADDRESS, startPortalApplication } from './support'

const TYPE_LABEL = 'Alarm system registration'
const ATTESTATION = /^I attest that the information in this application is true and complete/

test('an applicant submits a registration and pays its fee through the simulated checkout', async ({
  page,
  db,
  suffix,
}) => {
  const email = uniqueEmail('pay', suffix)
  await signInWithMagicLink(page, email)
  const applicationId = await startPortalApplication(page, PORTAL_PARCEL_ADDRESS, TYPE_LABEL)

  await page.getByLabel(/^Description/).fill(`Monitored alarm ${suffix}`)
  await page.getByLabel(/^Emergency contact name and phone/).fill('Lee Keyholder 603-555-0142')
  await page.getByLabel(ATTESTATION).check()
  await page.getByRole('button', { name: 'Submit application' }).click()
  await expect(page.getByRole('button', { name: 'Submit application' })).toHaveCount(0)

  const pay = page.getByRole('button', { name: /^Pay \$/ })
  await expect(pay).toBeVisible()
  await pay.click()
  await expect(page).toHaveURL(/\/dev\/checkout\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Simulated checkout')
  await page.getByRole('button', { name: 'Approve' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Payment received')
  const attempt = await db.one<{ state: string; channel: string }>(
    'select state, channel from payment_attempts where payer_user_id = $1',
    [await db.userIdFor(email)],
  )
  expect(attempt.channel).toBe('card_online')
  expect(['captured', 'settled']).toContain(attempt.state)
  expect((await draftOf(db, applicationId)).state).not.toBe('draft')
})
