import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export const SOURCE_PERMIT = 'Demo permit: Brookside setback variance'

export async function draftListId(db: E2eDb): Promise<string> {
  const row = await db.one<{ id: string }>(
    `select l.id from abutter_lists l
       join applications a on a.id = l.application_id
       join projects p on p.id = a.project_id
      where p.title = $1 and l.status = 'draft'`,
    [SOURCE_PERMIT],
  )
  return row.id
}

export async function openDraft(page: Page, db: E2eDb): Promise<string> {
  const id = await draftListId(db)
  await page.goto(`/staff/abutters/${id}`)
  await expect(page.getByRole('heading', { name: 'Parcels considered' })).toBeVisible()
  return id
}

export function candidateRow(page: Page, parcel: string): Locator {
  return page
    .getByRole('region', { name: 'Parcels considered' })
    .getByRole('row')
    .filter({ hasText: parcel })
}

export function recipientRow(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Who receives notice' })
    .getByRole('row')
    .filter({ hasText: name })
}

export async function openControl(row: Locator, summary: string): Promise<Locator> {
  const details = row
    .locator('details')
    .filter({ has: row.page().locator('summary', { hasText: summary }) })
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary', { hasText: summary }).click()
  }
  return details
}

export async function recipientData(db: E2eDb, listId: string, name: string) {
  return await db.one<{
    name: string
    address: string | null
    qualifies: boolean | null
    excluded: boolean
    decision_reason: string | null
  }>(
    `select data->>'name' as name, data->>'mailingAddress' as address, qualifies, excluded, decision_reason
       from abutter_list_recipients where list_id = $1 and data->>'name' like $2`,
    [listId, `${name}%`],
  )
}
