import type { Page } from '@playwright/test'

export async function openRecordHistory(page: Page): Promise<void> {
  const group = page.locator('details[data-history-group]')
  if ((await group.count()) === 0) return
  if (await group.evaluate((node) => (node as HTMLDetailsElement).open)) return
  await group.locator('summary').first().click()
}
