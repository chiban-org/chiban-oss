import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'
import { confirmWith } from './confirm'

export async function drawAndIssueList(
  page: Page,
  db: E2eDb,
  applicationId: string,
): Promise<void> {
  await page.goto(`/staff/applications/${applicationId}`)
  await page
    .getByRole('region', { name: 'Abutter lists' })
    .getByRole('button', { name: 'Draw a new list' })
    .click()
  await expect
    .poll(
      async () =>
        (await db.rows('select 1 from abutter_lists where application_id = $1', [applicationId]))
          .length,
    )
    .toBe(1)
  const list = await db.one<{ id: string }>(
    'select id from abutter_lists where application_id = $1',
    [applicationId],
  )
  await page.goto(`/staff/abutters/${list.id}`)
  await page.getByRole('button', { name: 'Confirm streets and streams were reviewed' }).click()
  await expect(
    page.getByRole('button', { name: 'Confirm streets and streams were reviewed' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Issue list' }).click()
  await confirmWith(page, 'Issue this list?', 'Issue the list')
  await expect
    .poll(
      async () =>
        (
          await db.one<{ status: string }>('select status from abutter_lists where id = $1', [
            list.id,
          ])
        ).status,
    )
    .toBe('issued')
}
