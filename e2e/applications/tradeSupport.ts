import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'
import {
  type CounterJob,
  counterJob,
  fillElectricalJob,
  licenseApplication,
  openElectricalForm,
} from './counterSupport'

export interface OpenTrade {
  job: CounterJob
  applicationId: string
  number: string
}

export async function unpaidTradeAtCounter(
  page: Page,
  db: E2eDb,
  suffix: string,
): Promise<OpenTrade> {
  const job = counterJob(suffix)
  await openElectricalForm(page)
  await fillElectricalJob(page, job)
  await page.getByLabel('Card', { exact: true }).click()
  await page.getByRole('button', { name: 'Issue and print' }).click()
  const reader = page.getByRole('region', { name: 'Card reader' })
  await reader.getByRole('button', { name: 'Decline' }).click()
  await expect(reader.getByRole('status')).toContainText('Card declined.')
  const row = await licenseApplication(db, job.license)
  expect(row.state).toBe('submitted')
  return { job, applicationId: row.application_id, number: row.number }
}

export async function openTrade(page: Page, trade: OpenTrade): Promise<void> {
  await page.goto(`/staff/applications/${trade.applicationId}`)
  await expect(page.getByRole('heading', { level: 1, name: trade.number })).toBeVisible()
}
