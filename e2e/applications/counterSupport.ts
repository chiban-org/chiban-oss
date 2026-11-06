import type { Page } from '@playwright/test'
import { type E2eDb, expect, uniqueEmail } from '../fixtures/test'

export interface CounterJob {
  contractor: string
  email: string
  license: string
}

export function counterJob(suffix: string): CounterJob {
  return {
    contractor: `Pat Wiring ${suffix}`,
    email: uniqueEmail('counter-contractor', suffix),
    license: `EL-${suffix}`,
  }
}

export async function openElectricalForm(page: Page): Promise<void> {
  await page.goto('/staff/counter')
  await page.getByRole('link', { name: 'Electrical permit' }).click()
  await page.getByLabel('Search by parcel ID, address, or owner').fill('12 Heron Cove Road')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('link', { name: /Larkspur Family Trust/ }).click()
  await expect(page.getByRole('heading', { name: 'Work details' })).toBeVisible()
}

export async function fillElectricalJob(page: Page, job: CounterJob): Promise<void> {
  await page.getByLabel('Contractor name').fill(job.contractor)
  await page.getByLabel('Contractor email').fill(job.email)
  await page.getByLabel('License number').fill(job.license)
  await page.getByLabel('Result of the state lookup').selectOption({ label: 'Active' })
  await page.getByLabel('Description of work').fill('Replace the main panel with a 200 amp panel')
}

export async function licenseApplication(db: E2eDb, license: string) {
  return await db.one<{ application_id: string; number: string; state: string }>(
    `select lc.application_id, a.number, a.state
       from license_checks lc join applications a on a.id = lc.application_id
      where lc.license_number = $1`,
    [license],
  )
}
