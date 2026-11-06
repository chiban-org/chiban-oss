import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

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

export async function openRequest(page: Page, requestId: string): Promise<void> {
  await page.goto(`/staff/records/requests/${requestId}`)
  await expect(page.getByRole('heading', { level: 2, name: 'First response' })).toBeVisible()
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
