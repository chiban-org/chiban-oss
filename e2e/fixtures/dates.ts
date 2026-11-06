import { expect, type Locator } from '@playwright/test'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function fillDate(input: Locator, isoDate: string): Promise<void> {
  if (!ISO_DATE.test(isoDate)) throw new Error(`fillDate takes YYYY-MM-DD, got "${isoDate}"`)
  await input.fill(isoDate)
  await expect(input).toHaveValue(isoDate)
}
