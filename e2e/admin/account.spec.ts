import { currentTotpCode } from '@/features/auth/totp'
import { expect, test } from '../fixtures/test'
import { expectConfirmation, INVITEE_PASSWORD, inviteAndSignIn } from './support'

test.use({ role: 'admin' })

const NEW_PASSWORD = 'heron-cove-lantern-2026'

test.describe('own account of a staff user the admin invited', () => {
  test('renames, changes the password, sets up the authenticator and has it reset by the admin', async ({
    page,
    pageAs,
    db,
    suffix,
  }) => {
    const { guest, name, userId } = await inviteAndSignIn(page, pageAs, suffix, 'acct')
    await guest.goto('/staff/account')

    const nameField = guest.locator('input[name="displayName"]')
    await nameField.fill(`${name} Jr`)
    await guest.getByRole('button', { name: 'Save name' }).click()
    await expectConfirmation(guest, 'Name saved.')
    expect(
      (
        await db.one<{ display_name: string }>('select display_name from users where id = $1', [
          userId,
        ])
      ).display_name,
    ).toBe(`${name} Jr`)

    await nameField.fill('   ')
    await guest.getByRole('button', { name: 'Save name' }).click()
    await expect(nameField).toHaveAttribute('aria-invalid', 'true')

    const current = guest.locator('input[name="current"]')
    await current.fill('not-the-password-at-all')
    await guest.locator('input[name="password"]').fill(NEW_PASSWORD)
    await guest.locator('input[name="confirm"]').fill(NEW_PASSWORD)
    await guest.getByRole('button', { name: 'Change password' }).click()
    await expect(current).toHaveAttribute('aria-invalid', 'true')
    await expect(current).toHaveValue('')
    await expect(guest.locator('input[name="password"]')).toHaveValue(NEW_PASSWORD)
    const hashBefore = await db.one<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [userId],
    )

    await current.fill(INVITEE_PASSWORD)
    await guest.getByRole('button', { name: 'Change password' }).click()
    await expectConfirmation(guest, 'Password changed. Other devices were signed out.')
    const hashAfter = await db.one<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [userId],
    )
    expect(hashAfter.password_hash).not.toBe(hashBefore.password_hash)

    await guest.goto('/staff/account/totp')
    await guest.getByRole('button', { name: 'Set up authenticator' }).click()
    const shown = guest.locator('code').first()
    await expect(shown).toBeVisible()
    const secretText = await shown.innerText()
    const secret = secretText.replace(/\s+/g, '')
    const code = guest.getByLabel('6-digit code')
    await code.fill('000000')
    await guest.getByRole('button', { name: 'Confirm' }).click()
    await expect(code).toHaveAttribute('aria-invalid', 'true')
    expect(
      (
        await db.one<{ totp_enabled: boolean }>('select totp_enabled from users where id = $1', [
          userId,
        ])
      ).totp_enabled,
    ).toBe(false)

    await code.fill(currentTotpCode(secret, Date.now()))
    await guest.getByRole('button', { name: 'Confirm' }).click()
    await expect(guest).toHaveURL(/\/staff\/account\?totp=enabled$/)
    await expect(guest.getByText('Authenticator is set up.')).toBeVisible()
    expect(
      (
        await db.one<{ totp_enabled: boolean }>('select totp_enabled from users where id = $1', [
          userId,
        ])
      ).totp_enabled,
    ).toBe(true)

    await page.goto(`/staff/admin/users/${userId}`)
    await page.getByRole('button', { name: 'Reset authenticator' }).click()
    const confirm = page.getByRole('dialog')
    await expect(
      confirm.getByRole('heading', { name: `Reset ${name} Jr's authenticator?` }),
    ).toBeVisible()
    await confirm.getByRole('button', { name: 'Reset the authenticator' }).click()
    await expectConfirmation(page, 'Authenticator cleared. They can set up a new one from Account.')
    expect(
      (
        await db.one<{ totp_enabled: boolean }>('select totp_enabled from users where id = $1', [
          userId,
        ])
      ).totp_enabled,
    ).toBe(false)
  })
})
