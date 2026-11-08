import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect, fillDate } from '../fixtures/test'

export const LOG_DIALOG = 'Log a Right-to-Know request'

export async function logRequestViaForm(
  page: Page,
  db: E2eDb,
  description: string,
): Promise<string> {
  await page.goto('/staff/records/requests')
  await page.getByRole('button', { name: 'Log a request' }).click()
  const dialog = page.getByRole('dialog', { name: LOG_DIALOG })
  await dialog.getByLabel('What was asked for').fill(description)
  await dialog.getByRole('button', { name: 'Log request' }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Request logged.' }),
  ).toBeVisible()
  const row = await db.one<{ id: string }>('select id from rtk_requests where description = $1', [
    description,
  ])
  return row.id
}

export async function openRequest(page: Page, requestId: string, find?: string): Promise<void> {
  const query = find === undefined ? '' : `?find=${encodeURIComponent(find)}`
  await page.goto(`/staff/records/requests/${requestId}${query}`)
  await expect(page.getByRole('heading', { level: 1, name: /^RK-\d{4}-\d{4}$/ })).toBeVisible()
}

export function workCard(page: Page): Locator {
  return page.getByRole('region', { name: 'Do this now' })
}

export async function openHistory(page: Page): Promise<void> {
  await page.locator('[data-history-group] > summary').click()
}

export async function recordTimeStatement(page: Page, statedDate: string, reason: string) {
  const card = workCard(page)
  await card.getByRole('radio', { name: 'Written statement of the time needed' }).check()
  await fillDate(card.getByLabel('Date the town will respond by'), statedDate)
  await card.getByLabel('Why more time is needed').fill(reason)
  await card.getByRole('button', { name: 'Record response' }).click()
  await expectToast(page, 'Response recorded and the letter filed.')
}

export async function approveFound(page: Page, document: string): Promise<void> {
  const card = workCard(page)
  const row = card.getByRole('listitem').filter({ hasText: document }).first()
  const version = row
    .getByRole('list', { name: `Versions of ${document}` })
    .getByRole('listitem')
    .first()
  await version
    .getByLabel('What you checked before approving')
    .fill('Read every page, nothing exempt.')
  await version.getByRole('button', { name: `Approve ${document}: Original` }).click()
  await expectToast(page, 'Version approved.')
  await expect(card.getByRole('region', { name: 'Approved, not yet released' })).toBeVisible()
}

export function section(page: Page, name: string): Locator {
  return page.getByRole('region', { name })
}

export async function openDetails(scope: Locator, summary: string): Promise<void> {
  await scope.locator('summary').filter({ hasText: summary }).click()
}

export async function expectToast(page: Page, message: string): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: message })).toBeVisible()
}
