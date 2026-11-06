import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export const PORTAL_PARCEL_ADDRESS = '12 Tamarack Way'

export async function startPortalApplication(
  page: Page,
  address: string,
  typeLabel: string,
): Promise<string> {
  await page.goto('/portal/apply')
  await page.getByLabel('Find your parcel by address, owner, or parcel ID').fill(address)
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('link', { name: new RegExp(`^${address}, parcel `) }).click()
  await page.getByRole('radio', { name: typeLabel }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/portal\/applications\/[0-9a-f-]{36}$/)
  return new URL(page.url()).pathname.split('/').pop() ?? ''
}

export interface DraftRow {
  state: string
  values: Record<string, unknown>
}

export async function draftOf(db: E2eDb, applicationId: string): Promise<DraftRow> {
  return await db.one<DraftRow>('select state, values from applications where id = $1', [
    applicationId,
  ])
}
