import { expect, test, uniqueEmail } from '../fixtures/test'
import { messageAlert } from '../public/alert'

test.describe('staff sign-in refusals', () => {
  test('refuses an unknown address with one message that names neither field', async ({
    page,
    suffix,
  }) => {
    await page.goto('/staff/sign-in')
    await page.getByLabel('Email').fill(uniqueEmail('not-staff', suffix))
    await page.getByLabel('Password').fill('a-password-that-fits')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(messageAlert(page)).toHaveText('Email or password is incorrect.')
    await expect(page).toHaveURL(/\/staff\/sign-in/)
  })

  test('keeps empty fields on the form until both are filled', async ({ page }) => {
    await page.goto('/staff/sign-in')
    await page.getByRole('button', { name: 'Sign in' }).click()
    for (const name of ['Email', 'Password']) {
      const missing = await page
        .getByLabel(name)
        .evaluate((el) => (el as HTMLInputElement).validity.valueMissing)
      expect(missing).toBe(true)
    }
    await expect(messageAlert(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/staff\/sign-in/)
  })
})
