import type { Locator, Page } from '@playwright/test'
import {
  E2E_BASE_URL,
  type E2eDb,
  expect,
  linkIn,
  uniqueEmail,
  waitForEmail,
} from '../fixtures/test'

export { expectConfirmation, expectNotRefused, expectRefusedBeside } from '../applications/support'

export async function startDraft(
  page: Page,
  kind: string,
  newButton: string,
  name: string,
): Promise<string> {
  await page.goto(`/staff/settings/${kind}`)
  await page.getByRole('button', { name: newButton, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[name="label"]').fill(name)
  await dialog.getByRole('button', { name: 'Start a draft' }).click()
  await expect(page).toHaveURL(new RegExp(`/staff/settings/${kind}/[^/]+$`))
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled()
  return decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '')
}

export async function publishWithConfirm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click()
}

export function editorStatus(page: Page): Locator {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Publish', exact: true }) })
    .getByRole('status')
    .filter({ hasText: /\S/ })
}

export interface VersionRow {
  version: number
  status: string
  body: Record<string, unknown>
}

export async function versionsOf(db: E2eDb, kind: string, key: string): Promise<VersionRow[]> {
  return await db.rows<VersionRow>(
    'select version, status, body from config_versions where kind = $1 and key = $2 order by version',
    [kind, key],
  )
}

export async function expectGroupRefused(
  page: Page,
  field: string,
  message: string,
): Promise<void> {
  const group = page.locator(`[data-field="${field}"]`)
  await expect(group).toHaveAttribute('aria-describedby', `error-${field}`)
  await expect(page.locator(`#error-${field}`)).toContainText(message)
}

export async function expectListedRefusal(page: Page, message: string): Promise<void> {
  await expect(page.getByRole('alert').filter({ hasText: message }).first()).toBeVisible()
}

export const INVITEE_PASSWORD = 'tide-pool-marsh-2026'

export async function inviteStaff(
  page: Page,
  input: { name: string; email: string; roleLabel: string },
): Promise<string> {
  await page.goto('/staff/admin/users/invite')
  await page.locator('input[name="displayName"]').fill(input.name)
  await page.getByLabel('Email address').fill(input.email)
  await page.getByRole('checkbox', { name: new RegExp(`^${input.roleLabel}`) }).check()
  await page.getByRole('button', { name: 'Send invite' }).click()
  await expect(page).toHaveURL(/\/staff\/admin\/users\/[0-9a-f-]{36}\?notice=invited$/)
  return new URL(page.url()).pathname.split('/').at(-1) ?? ''
}

export interface SignedInInvitee {
  guest: Page
  email: string
  name: string
  userId: string
}

export async function inviteAndSignIn(
  admin: Page,
  pageAs: (role: 'anonymous') => Promise<Page>,
  suffix: string,
  label: string,
): Promise<SignedInInvitee> {
  const email = uniqueEmail(label, suffix)
  const name = `Invitee ${label} ${suffix}`
  const since = new Date(Date.now() - 2_000)
  const userId = await inviteStaff(admin, { name, email, roleLabel: 'Land use staff' })
  const prefix = `${E2E_BASE_URL}/staff/set-password?token=`
  const message = await waitForEmail({
    to: email,
    since,
    subject: 'Set up your staff account',
    containing: prefix,
  })
  const guest = await pageAs('anonymous')
  await guest.goto(linkIn(message, prefix))
  await guest.getByLabel('New password').fill(INVITEE_PASSWORD)
  await guest.getByLabel('Type it again').fill(INVITEE_PASSWORD)
  await guest.getByRole('button', { name: 'Save and sign in' }).click()
  await expect(guest).toHaveURL(/\/staff$/)
  return { guest, email, name, userId }
}

export async function publishedVersion(
  db: E2eDb,
  kind: string,
): Promise<VersionRow & { key: string }> {
  return await db.one<VersionRow & { key: string }>(
    "select key, version, status, body from config_versions where kind = $1 and status = 'published'",
    [kind],
  )
}

export async function restoreVersion(page: Page, version: number): Promise<void> {
  const label = `Restore version ${version}`
  const summary = page.locator('summary').filter({ hasText: 'Version history' })
  if ((await summary.count()) > 0) {
    const open = await summary.evaluate(
      (element) => (element.parentElement as HTMLDetailsElement).open,
    )
    if (!open) await summary.click()
  }
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click()
}
