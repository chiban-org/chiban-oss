import { applicationIdFor, demoTitle } from '../applications/support'
import { expect, signInWithMagicLink, test, uniqueEmail } from '../fixtures/test'

const SERVICE = demoTitle('Service upgrade')

test.describe('who may open an application in the portal', () => {
  test('the applicant on the project opens it', async ({ pageAs, db }) => {
    const id = await applicationIdFor(db, SERVICE)
    const owner = await pageAs('applicant')
    await owner.goto(`/portal/applications/${id}`)
    await expect(owner.getByRole('heading', { level: 1 })).toHaveText(SERVICE)
    await expect(owner.getByText('EL-2026-0001').first()).toBeVisible()
  })

  test('another applicant who types the same address is refused', async ({ page, db, suffix }) => {
    const id = await applicationIdFor(db, SERVICE)
    await signInWithMagicLink(page, uniqueEmail('other-applicant', suffix))
    const response = await page.goto(`/portal/applications/${id}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByText('EL-2026-0001')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Submit application' })).toHaveCount(0)
  })

  test('a signed-out visitor is sent to sign in and back', async ({ page, db }) => {
    const id = await applicationIdFor(db, SERVICE)
    await page.goto(`/portal/applications/${id}`)
    await expect(page).toHaveURL(
      `/sign-in?next=${encodeURIComponent(`/portal/applications/${id}`)}`,
    )
  })
})
