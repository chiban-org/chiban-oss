import type { Locator, Page } from '@playwright/test'

export function messageAlert(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: /\S/ })
}
