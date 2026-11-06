import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect, fillDate } from '../fixtures/test'
import { expectToast } from './requestSupport'

export async function pickParcel(field: Locator, query: string, optionText: string): Promise<void> {
  await field.fill(query)
  await field.page().getByRole('option').filter({ hasText: optionText }).first().click()
}

export async function addNewId(field: Locator, value: string): Promise<void> {
  await field.fill(value)
  await field
    .page()
    .getByRole('option', { name: /Use this ID anyway/ })
    .click()
}

export function freshGisIds(count: number): string[] {
  const stem = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10)
  return Array.from({ length: count }, (_, index) => `9${stem}${index}`)
}

export async function recordSubdivision(
  page: Page,
  parent: { query: string; option: string },
  childIds: string[],
): Promise<void> {
  await page.goto('/staff/parcels/lineage/new')
  await fillDate(page.getByLabel('Effective date'), '2026-10-01')
  await pickParcel(
    page.getByRole('combobox', { name: /^Parent parcels/ }),
    parent.query,
    parent.option,
  )
  const children = page.getByRole('combobox', { name: /^Child parcels/ })
  for (const id of childIds) await addNewId(children, id)
  await page.getByRole('button', { name: 'Record lineage event' }).click()
  await expectToast(page, 'Lineage event recorded.')
}

export async function parcelIdOfGis(db: E2eDb, value: string): Promise<string> {
  const row = await db.one<{ parcel_id: string }>(
    "select parcel_id from parcel_aliases where format = 'gis12' and value = $1",
    [value],
  )
  return row.parcel_id
}

export async function expectParcelPage(page: Page, parcelId: string): Promise<void> {
  await page.goto(`/staff/parcels/${parcelId}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}
