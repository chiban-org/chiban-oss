import type { Locator } from '@playwright/test'
import { expect } from '../fixtures/test'

async function describedText(field: Locator): Promise<string> {
  return await field.evaluate((element) =>
    (element.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter((id) => id !== '')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' '),
  )
}

export async function expectRefusedBeside(field: Locator, message: string): Promise<void> {
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect.poll(() => describedText(field)).toContain(message)
}

export async function expectGroupRefusal(fieldset: Locator, message: string): Promise<void> {
  await expect(fieldset.getByText(message, { exact: true })).toHaveCount(1)
}
