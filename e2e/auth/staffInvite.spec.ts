import { currentTotpCode } from '@/features/auth/totp'
import { expectRefusedBeside } from '../applications/support'
import { E2E_BASE_URL, expect, linkIn, test, uniqueEmail, waitForEmail } from '../fixtures/test'
import { messageAlert } from '../public/alert'

const PASSWORD = 'invited-staff-passphrase-1'
const SET_PASSWORD_PREFIX = `${E2E_BASE_URL}/staff/set-password?token=`

test.describe('inviting staff, choosing a password and turning on the authenticator', () => {
  test.use({ role: 'admin' })

  test('refuses a malformed address beside the field and sends no invite', async ({ page }) => {
    await page.goto('/staff/admin/users/invite')
    await page.getByLabel(/^Name/).fill('Malformed Address')
    await page.getByLabel(/^Email address/).fill('nobody@localhost')
    await page.getByRole('checkbox', { name: /^Finance/ }).check()
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expectRefusedBeside(page.getByLabel(/^Email address/), 'like name@example.com')
  })

  test('walks an invited clerk from the email link to a sign-in that asks for the code', async ({
    page,
    pageAs,
    db,
    suffix,
  }) => {
    const email = uniqueEmail('invitee', suffix)
    const since = new Date()
    await page.goto('/staff/admin/users/invite')
    await page.getByLabel(/^Name/).fill(`Ida Invitee ${suffix}`)
    await page.getByLabel(/^Email address/).fill(email)
    await page.getByRole('checkbox', { name: /^Finance/ }).check()
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page).toHaveURL(/\/staff\/admin\/users\/[0-9a-f-]{36}\?notice=invited$/)
    const invited = await db.one<{ kind: string; display_name: string }>(
      'select kind, display_name from users where email = $1',
      [email],
    )
    expect(invited).toEqual({ kind: 'staff', display_name: `Ida Invitee ${suffix}` })

    const message = await waitForEmail({
      to: email,
      since,
      subject: 'Set up your staff account',
      containing: SET_PASSWORD_PREFIX,
    })
    const clerk = await pageAs('anonymous')
    await clerk.goto(linkIn(message, SET_PASSWORD_PREFIX))
    await expect(clerk.getByRole('heading', { level: 1 })).toHaveText('Choose your password')
    await clerk.getByLabel('New password').fill(PASSWORD)
    await clerk.getByLabel('Type it again').fill(`${PASSWORD}-typo`)
    await clerk.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(messageAlert(clerk)).toHaveText('The two passwords do not match.')
    await clerk.getByLabel('New password').fill(PASSWORD)
    await clerk.getByLabel('Type it again').fill(PASSWORD)
    await clerk.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(clerk).toHaveURL('/staff')

    await clerk.goto('/staff/account/totp')
    await clerk.getByRole('button', { name: 'Set up authenticator' }).click()
    await expect(clerk).toHaveURL('/staff/account/totp')
    const secret = ((await clerk.locator('code').first().textContent()) ?? '').replace(/\s/g, '')
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    await clerk.getByLabel('6-digit code').fill('000000')
    await clerk.getByRole('button', { name: 'Confirm' }).click()
    await expectRefusedBeside(
      clerk.getByLabel('6-digit code'),
      'That code did not match. Try the next one.',
    )
    await clerk.getByLabel('6-digit code').fill(currentTotpCode(secret, Date.now()))
    await clerk.getByRole('button', { name: 'Confirm' }).click()
    await expect(clerk).toHaveURL('/staff/account?totp=enabled')

    const challenge = await pageAs('anonymous')
    await challenge.goto('/staff/sign-in')
    await challenge.getByLabel('Email').fill(email)
    await challenge.getByLabel('Password').fill(PASSWORD)
    await challenge.getByRole('button', { name: 'Sign in' }).click()
    const code = challenge.getByLabel('6-digit code from your authenticator')
    await expect(code).toBeVisible()
    await expect(challenge.getByLabel('Email')).toHaveValue(email)
    await expect(challenge.getByLabel('Password')).toHaveValue(PASSWORD)
    await code.fill('000000')
    await challenge.getByRole('button', { name: 'Verify and sign in' }).click()
    await expect(messageAlert(challenge)).toHaveText('Email, password, or code is incorrect.')
    await code.fill(currentTotpCode(secret, Date.now() + 30_000))
    await challenge.getByRole('button', { name: 'Verify and sign in' }).click()
    await expect(challenge).toHaveURL('/staff')
  })

  test('shows a used invite link as already used', async ({ page, pageAs, db, suffix }) => {
    const email = uniqueEmail('reused-invite', suffix)
    const since = new Date()
    await page.goto('/staff/admin/users/invite')
    await page.getByLabel(/^Name/).fill(`Reuse Invitee ${suffix}`)
    await page.getByLabel(/^Email address/).fill(email)
    await page.getByRole('checkbox', { name: /^Finance/ }).check()
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page).toHaveURL(/notice=invited$/)
    expect(await db.userIdFor(email)).toMatch(/^[0-9a-f-]{36}$/)
    const message = await waitForEmail({ to: email, since, containing: SET_PASSWORD_PREFIX })
    const link = linkIn(message, SET_PASSWORD_PREFIX)
    const first = await pageAs('anonymous')
    await first.goto(link)
    await first.getByLabel('New password').fill(PASSWORD)
    await first.getByLabel('Type it again').fill(PASSWORD)
    await first.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(first).toHaveURL('/staff')
    const second = await pageAs('anonymous')
    await second.goto(link)
    await expect(messageAlert(second)).toHaveText(
      'This invite link has already been used. Sign in with the password you chose.',
    )
  })
})
