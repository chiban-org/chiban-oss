import { E2E_BASE_URL, expect, linkIn, test, uniqueEmail, waitForEmail } from '../fixtures/test'
import { expectConfirmation, expectRefusedBeside, INVITEE_PASSWORD, inviteStaff } from './support'

test.use({ role: 'admin' })

const SET_PASSWORD_PREFIX = `${E2E_BASE_URL}/staff/set-password?token=`

test.describe('staff user administration', () => {
  test('refuses a name of 5000 characters beside the field and creates no account', async ({
    page,
    db,
    suffix,
  }) => {
    const email = uniqueEmail('longname', suffix)
    await page.goto('/staff/admin/users/invite')
    const name = page.locator('input[name="displayName"]')
    await name.evaluate((element) => {
      ;(element as HTMLInputElement).value = 'N'.repeat(5000)
    })
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('checkbox', { name: /^Land use staff/ }).check()
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expectRefusedBeside(name, 'Enter a name of 120 characters or fewer.')
    expect(await db.rows('select 1 from users where email = $1', [email])).toHaveLength(0)
  })

  test('invites a clerk, who sets a password from the email, then roles, reset, disable and enable', async ({
    page,
    pageAs,
    db,
    suffix,
  }) => {
    const email = uniqueEmail('invitee', suffix)
    const name = `Invitee ${suffix}`
    const since = new Date(Date.now() - 2_000)
    const userId = await inviteStaff(page, { name, email, roleLabel: 'Land use staff' })
    await expect(page.getByText('Invite sent. The link works once for 7 days.')).toBeVisible()
    const created = await db.one<{
      id: string
      display_name: string
      password_hash: string | null
    }>('select id, display_name, password_hash from users where email = $1', [email])
    expect(created.id).toBe(userId)
    expect(created.display_name).toBe(name)
    expect(created.password_hash).toBeNull()

    const message = await waitForEmail({
      to: email,
      since,
      subject: 'Set up your staff account',
      containing: SET_PASSWORD_PREFIX,
    })
    const guest = await pageAs('anonymous')
    await guest.goto(linkIn(message, SET_PASSWORD_PREFIX))
    await guest.getByLabel('New password').fill(INVITEE_PASSWORD)
    await guest.getByLabel('Type it again').fill(INVITEE_PASSWORD)
    await guest.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(guest).toHaveURL(/\/staff$/)
    expect(
      (
        await db.one<{ password_hash: string | null }>(
          'select password_hash from users where email = $1',
          [email],
        )
      ).password_hash,
    ).not.toBeNull()

    await page.reload()
    await page.getByRole('checkbox', { name: /^Inspector/ }).check()
    await page.getByRole('button', { name: 'Save roles' }).click()
    await expectConfirmation(page, 'Roles saved. They apply on the next page this person opens.')
    const roles = await db.rows<{ role: string }>(
      'select role from user_roles where user_id = $1 order by role',
      [userId],
    )
    expect(roles.map((r) => r.role)).toEqual(['inspector', 'staff'])

    const resetSince = new Date(Date.now() - 2_000)
    await page.getByRole('button', { name: 'Send password reset link' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Send the link' }).click()
    await expectConfirmation(
      page,
      'Password reset link sent. It works once and expires in 24 hours.',
    )
    await waitForEmail({ to: email, since: resetSince, subject: 'Reset your password' })

    await page.getByText('Disable this account', { exact: true }).click()
    const reason = page.getByLabel('Reason')
    await page.getByRole('button', { name: 'Disable account' }).click()
    await expect(reason).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(
      (await db.one<{ is_active: boolean }>('select is_active from users where id = $1', [userId]))
        .is_active,
    ).toBe(true)

    await reason.fill(`Left the department, ${suffix}`)
    await page.getByRole('button', { name: 'Disable account' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByRole('heading', { name: `Disable ${name}'s account?` })).toBeVisible()
    await confirm.getByRole('button', { name: 'Disable the account' }).click()
    await expectConfirmation(page, 'Account disabled. This person is signed out everywhere.')
    expect(
      (await db.one<{ is_active: boolean }>('select is_active from users where id = $1', [userId]))
        .is_active,
    ).toBe(false)

    await page.getByRole('button', { name: 'Re-enable account' }).click()
    await expectConfirmation(page, 'Account re-enabled. This person can sign in again.')
    expect(
      (await db.one<{ is_active: boolean }>('select is_active from users where id = $1', [userId]))
        .is_active,
    ).toBe(true)
  })

  test('resends an invite and revokes it, which disables the account', async ({
    page,
    db,
    suffix,
  }) => {
    const email = uniqueEmail('revoked', suffix)
    const name = `Revoked ${suffix}`
    const userId = await inviteStaff(page, { name, email, roleLabel: 'Finance' })
    const resendSince = new Date(Date.now() - 2_000)
    await page.getByRole('button', { name: 'Resend invite' }).click()
    await expectConfirmation(page, 'A new invite link was sent. The old link no longer works.')
    await waitForEmail({ to: email, since: resendSince, subject: 'Set up your staff account' })

    await page.getByRole('button', { name: 'Revoke invite' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByRole('heading', { name: `Revoke ${name}'s invite?` })).toBeVisible()
    await confirm.getByRole('button', { name: 'Revoke the invite' }).click()
    await expectConfirmation(page, 'Invite revoked. The account is disabled.')
    expect(
      (await db.one<{ is_active: boolean }>('select is_active from users where id = $1', [userId]))
        .is_active,
    ).toBe(false)
  })
})
