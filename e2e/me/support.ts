import { expect, type Page } from '@playwright/test'
import { E2E_DATABASE_NAME, E2E_PORT, E2E_STAFF_PASSWORD } from '../fixtures/settings'
import { accountFor, type E2eDb, type StaffRoleKey } from '../fixtures/test'
import { ME_PACK_ID } from './mePack'

export const TOWN = 'Town of Fernhollow'

const NH_TERMS: readonly RegExp[] = [
  /Right-to-Know/i,
  /\bZBA\b/,
  /Zoning Board/i,
  /selectmen/i,
  /\bRSA\s/,
]

export function expectMaineDatabase(): void {
  expect(E2E_DATABASE_NAME).toBe(`chiban_e2e_${ME_PACK_ID}_${E2E_PORT}`)
}

export async function expectNoNhTerms(page: Page): Promise<void> {
  const text = await page.locator('body').innerText()
  const found = text.split('\n').filter((line) => NH_TERMS.some((term) => term.test(line)))
  expect(found, `New Hampshire wording on ${page.url()}`).toEqual([])
}

export async function signInAs(page: Page, role: StaffRoleKey): Promise<void> {
  await page.goto('/staff/sign-in')
  await expect(page.getByLabel('Password')).toBeVisible()
  await expectNoNhTerms(page)
  await page.getByLabel('Email').fill(accountFor(role).email)
  await page.getByLabel('Password').fill(E2E_STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/staff$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  await expectNoNhTerms(page)
}

export async function storyApplicationId(db: E2eDb, title: string): Promise<string> {
  const row = await db.one<{ id: string }>(
    `select a.id from applications a join projects p on p.id = a.project_id
     where p.title like '%: ' || $1`,
    [title],
  )
  return row.id
}

export async function decisionIdFor(db: E2eDb, applicationId: string): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select id from board_decisions where application_id = $1',
    [applicationId],
  )
  return row.id
}
