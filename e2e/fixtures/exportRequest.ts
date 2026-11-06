import type { Page } from '@playwright/test'
import { type E2eDb, expect } from './test'

const REQUESTED_COPY = 'Export requested. It is ready in a few minutes. Reload this page to see it.'
const RUNNING_COPY = 'An export is already being prepared. Wait for it to finish.'

export type ExportRequestOutcome = 'requested' | 'already_running'

export async function requestBusinessExport(page: Page): Promise<ExportRequestOutcome> {
  await page.goto('/staff/admin/export')
  await page.getByRole('button', { name: 'Request a new export' }).click()
  const requested = page.locator('[data-sonner-toast]').filter({ hasText: REQUESTED_COPY })
  const running = page.locator('p[role="status"]').filter({ hasText: RUNNING_COPY })
  await expect(requested.or(running)).toBeVisible()
  return (await requested.count()) > 0 ? 'requested' : 'already_running'
}

export async function activeBusinessExports(
  db: E2eDb,
): Promise<{ status: string; requested_by: string }[]> {
  return await db.rows(
    "select status, requested_by from exports where kind = 'business' and status in ('queued', 'running')",
  )
}
