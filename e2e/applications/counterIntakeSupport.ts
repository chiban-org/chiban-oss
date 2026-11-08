import type { Page } from '@playwright/test'
import { type E2eDb, expect } from '../fixtures/test'

const VARIANCE_ANSWERS: readonly (readonly [string, string])[] = [
  ['Project description', 'Add a farmers porch that reaches into the front setback'],
  ['Applicant mailing address', '12 Heron Cove Road, Alder Pond, NH 03999'],
  ['Ordinance section', 'Article IV, section 4.2'],
  ['Relief requested', 'Relief of six feet from the forty foot front setback'],
  ['The variance will not be contrary to the public interest', 'The porch matches the street.'],
  ['The spirit of the ordinance is observed', 'The house keeps its open front yard.'],
  ['Substantial justice is done', 'The owner gains a usable entry with no harm to others.'],
  ['The values of surrounding properties are not diminished', 'A porch adds to the street.'],
  ['Denial would result in unnecessary hardship', 'The lot is shallow and the house sits forward.'],
]

export async function openVarianceApplicant(page: Page, email: string): Promise<void> {
  await page.goto('/staff/counter')
  const review = page.getByRole('region', { name: 'Take for review' })
  await review.getByRole('link', { name: 'Variance', exact: true }).click()
  await page.getByLabel('Search by parcel ID, address, or owner').fill('12 Heron Cove Road')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('link', { name: /Larkspur Family Trust/ }).click()
  await page.getByLabel('Applicant email').fill(email)
  await page.getByRole('button', { name: 'Find account' }).click()
}

export async function fillVarianceAndSubmit(page: Page, applicantName: string): Promise<void> {
  await expect(page).toHaveURL(/\/staff\/counter\/take\/[0-9a-f-]{36}$/)
  await page.getByRole('textbox', { name: 'Applicant name', exact: true }).fill(applicantName)
  for (const [label, answer] of VARIANCE_ANSWERS) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(answer)
  }
  await page.getByRole('checkbox', { name: 'The owner has authorized this application' }).click()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/step=documents$/)
  await page.getByRole('link', { name: 'Continue to attestation and submit' }).click()
  await page
    .getByRole('checkbox', { name: 'The applicant signed the attestation on paper' })
    .click()
  await page.getByRole('button', { name: 'Submit the application' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'is submitted.' })).toBeVisible()
}

export async function intakeFor(db: E2eDb, partyEmail: string) {
  return await db.one<{
    application_id: string
    number: string
    state: string
    user_id: string | null
  }>(
    `select a.id as application_id, a.number, a.state, pp.user_id
       from counter_intakes ci
       join applications a on a.id = ci.application_id
       join project_parties pp on pp.id = ci.applicant_party_id
      where pp.email = $1`,
    [partyEmail],
  )
}
