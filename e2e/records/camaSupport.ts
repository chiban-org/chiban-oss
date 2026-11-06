import type { Page } from '@playwright/test'
import { DEFAULT_CAMA_COLUMNS } from '@/features/cama/mapping'
import { expect } from '../fixtures/test'

export interface OwnerRow {
  mapLot: string
  owner: string
}

export function camaCsv(rows: OwnerRow[]): Buffer {
  const lines = rows.map((row) =>
    [
      row.mapLot.slice(0, 3),
      row.mapLot.slice(3, 6),
      '000',
      '000',
      row.owner,
      '',
      'PO Box 9',
      '',
      'Alder Pond',
      'NH',
      '03999',
      '1',
      'Test Road',
    ].join(','),
  )
  return Buffer.from(`${[DEFAULT_CAMA_COLUMNS.join(','), ...lines].join('\n')}\n`)
}

export async function chooseCamaFile(
  page: Page,
  content: Buffer,
  name = 'cama.csv',
): Promise<void> {
  await page.getByLabel('CAMA file').setInputFiles({ name, mimeType: 'text/csv', buffer: content })
}

export async function runCamaImport(page: Page, rows: OwnerRow[]): Promise<string> {
  await page.goto('/staff/gis/imports/cama')
  await chooseCamaFile(page, camaCsv(rows))
  await page.getByLabel('This file lists every parcel').uncheck()
  await page.getByRole('button', { name: 'Run import' }).click()
  const report = page.getByRole('link', { name: 'View the run report.' })
  await expect(report).toBeVisible()
  const href = await report.getAttribute('href')
  return (href ?? '').split('/').pop() ?? ''
}
