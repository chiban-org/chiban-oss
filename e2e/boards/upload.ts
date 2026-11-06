import type { Locator } from '@playwright/test'
import { expect } from '../fixtures/test'

export async function uploadPdf(scope: Locator, fileLabel: string, title: string): Promise<void> {
  await scope.getByLabel(fileLabel, { exact: true }).setInputFiles({
    name: `${title}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(`%PDF-1.4\n% ${title}\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n`),
  })
  await scope.getByLabel('Name for this document').fill(title)
  await scope.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(scope.getByText('Uploaded.', { exact: true })).toBeVisible()
}
