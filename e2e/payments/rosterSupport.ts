import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export const ROSTER_URL = '/staff/notice-contacts'

export async function openRoster(page: Page): Promise<void> {
  await page.goto(ROSTER_URL)
  await expect(page.getByRole('heading', { name: 'Notice contacts', level: 1 })).toBeVisible()
}

export async function openDialog(page: Page, buttonName: string, title: string): Promise<Locator> {
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  return dialog
}

export function rosterRow(page: Page, text: string): Locator {
  return page.getByRole('row').filter({ hasText: text })
}

export async function pickParcel(scope: Locator, query: string, optionPattern: RegExp) {
  await scope.getByRole('combobox', { name: /^Parcel/ }).fill(query)
  await scope.page().getByRole('option', { name: optionPattern }).click()
}

export async function daysFromTownToday(db: E2eDb, days: number): Promise<string> {
  const row = await db.one<{ day: string }>(
    'select ((now() at time zone time_zone)::date + $1::int)::text as day from town_settings',
    [days],
  )
  return row.day
}
