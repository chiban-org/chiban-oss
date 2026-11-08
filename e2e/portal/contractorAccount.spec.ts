import type { Page } from '@playwright/test'
import { counterJob, fillElectricalJob, openElectricalForm } from '../applications/counterSupport'
import { E2E_BASE_URL, expect, linkIn, test, uniqueEmail, waitForEmail } from '../fixtures/test'

const MAIL_CLOCK_SLACK_MS = 2_000

async function signUpAsContractor(page: Page, email: string): Promise<void> {
  const since = new Date(Date.now() - MAIL_CLOCK_SLACK_MS)
  await page.goto('/sign-in')
  await page.getByRole('link', { name: 'Create a contractor account' }).click()
  await expect(page.getByRole('heading', { name: 'Create a contractor account' })).toBeVisible()
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  const prefix = `${E2E_BASE_URL}/auth/verify?token=`
  const message = await waitForEmail({ to: email, since, containing: prefix })
  await page.goto(linkIn(message, prefix))
  await page.getByRole('button', { name: `Continue as ${email}` }).click()
  await expect(page).toHaveURL('/account?setup=contractor')
}

async function fillProfile(page: Page, company: string, license: string): Promise<void> {
  await page.getByLabel('Company name').fill(company)
  await page.getByLabel('Contact name').fill('Pat Wiring')
  await page.getByLabel('Phone').fill('603-555-0142')
  await page.getByLabel('Mailing address').fill('12 Mill Road, Alder Pond, NH')
  await page.getByRole('checkbox', { name: 'Electrical' }).click()
  await page.getByLabel('NH license number, electrical').fill(license)
  await page.getByRole('button', { name: 'Set up the contractor profile' }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Your contractor profile is set up.' }),
  ).toBeVisible()
}

test.describe('contractor accounts', () => {
  test('a contractor signs up, the counter sees the profile, and the permit lands on their page', async ({
    page,
    pageAs,
    db,
    suffix,
  }) => {
    const job = counterJob(suffix)
    const company = `Pat Wiring ${suffix} LLC`
    await signUpAsContractor(page, job.email)
    await fillProfile(page, company, job.license)
    const userId = await db.userIdFor(job.email)
    const profile = await db.one<{ company_name: string }>(
      'select company_name from contractor_profiles where user_id = $1',
      [userId],
    )
    expect(profile.company_name).toBe(company)

    const clerk = await pageAs('staff')
    await openElectricalForm(clerk)
    await clerk.getByLabel('Contractor name').fill(job.contractor)
    await clerk.getByLabel('Contractor email').fill(job.email)
    await clerk.getByLabel('Contractor email').blur()
    await expect(clerk.getByRole('status').filter({ hasText: company })).toContainText(
      `Electrical ${job.license}`,
    )
    await expect(clerk.getByLabel('License number')).toHaveValue(job.license)
    await fillElectricalJob(clerk, job)
    await clerk.getByLabel('Cash tendered (dollars)').fill('1000')
    await clerk.getByRole('button', { name: 'Issue and print' }).click()
    await expect(clerk.getByRole('status').filter({ hasText: / is issued$/ })).toBeVisible()

    await page.goto('/portal/contractor')
    await expect(page.getByRole('link', { name: /^Electrical/ })).toBeVisible()

    await clerk.goto(`/staff/contractors?q=${encodeURIComponent(company)}`)
    const row = clerk.getByRole('row').filter({ hasText: company })
    await expect(row).toContainText(job.license)
    await expect(row).toContainText(job.email)
  })

  test('an applicant edits their details on the account page', async ({ page, suffix }) => {
    const email = uniqueEmail('account', suffix)
    await page.goto('/account')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/)
    const since = new Date(Date.now() - MAIL_CLOCK_SLACK_MS)
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    const prefix = `${E2E_BASE_URL}/auth/verify?token=`
    await page.goto(linkIn(await waitForEmail({ to: email, since, containing: prefix }), prefix))
    await page.getByRole('button', { name: `Continue as ${email}` }).click()
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
    await page.getByLabel('Your name').fill('Morgan Reyes')
    await page.getByLabel('Phone').fill('603-555-0110')
    await page.getByRole('button', { name: 'Save your details' }).click()
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Your details are saved.' }),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Your name')).toHaveValue('Morgan Reyes')
    await expect(page.getByRole('link', { name: 'Set up a contractor profile' })).toBeVisible()
  })
})
