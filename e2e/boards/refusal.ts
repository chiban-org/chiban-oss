import type { Locator } from '@playwright/test'
import { expect } from '../fixtures/test'

export async function expectRefused(field: Locator, message: string): Promise<void> {
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  const describedBy = await field.getAttribute('aria-describedby')
  const ids = (describedBy ?? '').split(/\s+/).filter((id) => id !== '')
  expect(ids.length).toBeGreaterThan(0)
  const page = field.page()
  const texts = await Promise.all(
    ids.map(async (id) => (await page.locator(`[id="${id}"]`).textContent()) ?? ''),
  )
  expect(texts.join(' ')).toContain(message)
}
