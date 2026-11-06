import type { Locator, Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

export const demoTitle = (name: string) => `Demo permit: ${name}`

export async function applicationIdFor(db: E2eDb, title: string): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select a.id from applications a join projects p on p.id = a.project_id where p.title = $1',
    [title],
  )
  return row.id
}

export async function openApplication(page: Page, db: E2eDb, title: string): Promise<string> {
  const id = await applicationIdFor(db, title)
  await page.goto(`/staff/applications/${id}`)
  await expect(page.locator('main:not([aria-busy])')).toBeVisible()
  return id
}

export function visibleSummary(page: Page, text: string | RegExp): Locator {
  return page.locator('summary:visible').filter({ hasText: text })
}

export async function applicationByNumber(page: Page, db: E2eDb, number: string): Promise<string> {
  const row = await db.one<{ id: string }>('select id from applications where number = $1', [
    number,
  ])
  await page.goto(`/staff/applications/${row.id}`)
  await expect(page.locator('main:not([aria-busy])')).toBeVisible()
  return row.id
}

export async function describedText(field: Locator): Promise<string> {
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

export async function expectNotRefused(field: Locator): Promise<void> {
  await expect(field).not.toHaveAttribute('aria-invalid', 'true')
}
