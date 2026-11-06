import type { Page } from '@playwright/test'
import { expect } from '../fixtures/test'

export async function expectFormStatus(page: Page, message: string): Promise<void> {
  await expect(page.getByRole('main').getByText(message).first()).toBeVisible()
}
