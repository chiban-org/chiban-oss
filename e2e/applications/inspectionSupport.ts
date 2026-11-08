import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export interface InspectionRow {
  id: string
  status: string
  scheduled_date: string | null
  start_minute: number | null
  preferred_date: string | null
}

export async function inspectionOf(
  db: E2eDb,
  number: string,
  type: string,
  status?: string,
): Promise<InspectionRow> {
  return await db.one<InspectionRow>(
    `select i.id, i.status, i.scheduled_date::text, i.start_minute, i.preferred_date::text
       from inspections i join applications a on a.id = i.application_id
      where a.number = $1 and i.inspection_type = $2 and ($3::text is null or i.status = $3)
      order by i.requested_at desc limit 1`,
    [number, type, status ?? null],
  )
}

export async function chooseRequest(page: Page, text: string): Promise<void> {
  await page
    .getByRole('region', { name: 'Requests and bookings' })
    .getByRole('listitem')
    .filter({ hasText: text })
    .getByRole('button')
    .click()
}

export function openSlotsOn(page: Page, longDate: string): Locator {
  return page
    .getByRole('region', { name: 'Open slots' })
    .getByRole('listitem', { name: new RegExp(`, ${longDate}, Ira Inspector$`) })
}

export async function bookSlot(page: Page, longDate: string, clock: string): Promise<void> {
  await openSlotsOn(page, longDate)
    .getByRole('button', { name: new RegExp(`^${clock},`) })
    .click()
  await page
    .getByRole('group', { name: 'Review the booking' })
    .getByRole('button', { name: 'Book', exact: true })
    .click()
  await expect(
    page
      .getByRole('region', { name: 'Open slots' })
      .getByRole('status')
      .filter({ hasText: 'Scheduled. The inspector gets a calendar invite.' }),
  ).toBeVisible()
}

export async function passEveryItem(page: Page): Promise<void> {
  const groups = page.getByRole('radiogroup')
  await expect(groups.first()).toBeVisible()
  const count = await groups.count()
  for (let index = 0; index < count; index += 1) {
    await groups.nth(index).getByRole('radio', { name: 'Pass' }).click()
  }
}
