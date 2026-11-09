import { licenseApplication } from '../applications/counterSupport'
import { expect, signInWithMagicLink, test, uniqueEmail } from '../fixtures/test'
import { messageAlert } from './alert'
import { claimAs, issueAndSendClaim } from './claimSupport'

const USED_OR_EXPIRED = 'This link has expired or was already used.'
const BOGUS_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789'

test.describe('claiming a project from an emailed contractor link', () => {
  test.describe('as the clerk who issued the permit', () => {
    test.use({ role: 'staff' })

    test('links the contractor who signs in with the address that received it, and refuses another account', async ({
      page,
      pageAs,
      db,
      suffix,
    }) => {
      const { job, link } = await issueAndSendClaim(page, suffix)

      const stranger = await pageAs('applicant')
      await stranger.goto(link)
      await stranger.getByRole('button', { name: 'Claim this project' }).click()
      await expect(stranger.getByRole('status')).toContainText(
        'This link was sent to a different email address than the one you are signed in with.',
      )
      const untouched = await db.one<{ claimed_at: string | null }>(
        'select claimed_at::text from contractor_claims where email = $1',
        [job.email],
      )
      expect(untouched.claimed_at).toBeNull()

      const contractor = await pageAs('anonymous')
      await claimAs(contractor, job.email, link)
      const permit = await licenseApplication(db, job.license)
      await expect(contractor.getByRole('link', { name: new RegExp(permit.number) })).toBeVisible()
      const claimed = await db.one<{ claimed_by: string }>(
        'select claimed_by from contractor_claims where email = $1',
        [job.email],
      )
      expect(claimed.claimed_by).toBe(await db.userIdFor(job.email))

      await contractor.goto(link)
      await expect(messageAlert(contractor)).toHaveText(USED_OR_EXPIRED)
      await expect(contractor.getByRole('button', { name: 'Claim this project' })).toHaveCount(0)
    })
  })

  test('refuses a made-up token for a signed-in visitor before offering the claim button', async ({
    page,
    suffix,
  }) => {
    await signInWithMagicLink(page, uniqueEmail('bogus-claim', suffix))
    await page.goto(`/claim/${BOGUS_TOKEN}`)
    await expect(messageAlert(page)).toHaveText(USED_OR_EXPIRED)
    await expect(page.getByRole('button', { name: 'Claim this project' })).toHaveCount(0)
    await expect(page).toHaveURL(`/claim/${BOGUS_TOKEN}`)
  })

  test('refuses a token of the wrong shape without offering the claim button', async ({ page }) => {
    await page.goto('/claim/short')
    await expect(messageAlert(page)).toHaveText(USED_OR_EXPIRED)
    await expect(page.getByRole('button', { name: 'Claim this project' })).toHaveCount(0)
  })
})
