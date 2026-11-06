import { expect, type Page } from '@playwright/test'
import { linkIn, waitForEmail } from './mailpit'
import { E2E_BASE_URL, E2E_STAFF_PASSWORD } from './settings'

const PUBLIC_SIGN_IN = '/sign-in'
const MAIL_CLOCK_SLACK_MS = 2_000
const MAGIC_LINK_SENT =
  'If that address can sign in, a link is on its way. It expires in 15 minutes.'

export async function signInWithPassword(
  page: Page,
  email: string,
  password: string = E2E_STAFF_PASSWORD,
): Promise<void> {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/staff\/sign-in/)
}

export async function signInWithMagicLink(page: Page, email: string): Promise<void> {
  const since = new Date(Date.now() - MAIL_CLOCK_SLACK_MS)
  if (new URL(page.url()).pathname !== PUBLIC_SIGN_IN) await page.goto(PUBLIC_SIGN_IN)
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByRole('status')).toHaveText(MAGIC_LINK_SENT)
  const prefix = `${E2E_BASE_URL}/auth/verify?token=`
  const message = await waitForEmail({
    to: email,
    since,
    subject: 'Your sign-in link',
    containing: prefix,
  })
  await page.goto(linkIn(message, prefix))
  await page.getByRole('button', { name: `Continue as ${email}` }).click()
  await expect(page).not.toHaveURL(/\/auth\/verify/)
}
