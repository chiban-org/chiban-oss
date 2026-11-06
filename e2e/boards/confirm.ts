import type { Locator, Page } from '@playwright/test'
import { expect } from '../fixtures/test'

export function confirmDialog(page: Page, title: string | RegExp): Locator {
  return page.getByRole('dialog', { name: title })
}

export async function confirmWith(
  page: Page,
  title: string | RegExp,
  buttonLabel: string,
): Promise<void> {
  const dialog = confirmDialog(page, title)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: buttonLabel }).click()
  await expect(dialog).toHaveCount(0)
}

export function permissionAlert(page: Page): Locator {
  return page.getByRole('main').getByRole('alert')
}
