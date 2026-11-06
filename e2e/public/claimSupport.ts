import type { Page } from '@playwright/test'
import {
  type CounterJob,
  counterJob,
  fillElectricalJob,
  openElectricalForm,
} from '../applications/counterSupport'
import { E2E_BASE_URL, expect, linkIn, signInWithMagicLink, waitForEmail } from '../fixtures/test'

export const CLAIM_PREFIX = `${E2E_BASE_URL}/claim/`

export async function issueAndSendClaim(
  staff: Page,
  suffix: string,
): Promise<{ job: CounterJob; link: string }> {
  const job = counterJob(suffix)
  const since = new Date()
  await openElectricalForm(staff)
  await fillElectricalJob(staff, job)
  await staff.getByLabel('Cash tendered (dollars)').fill('1000')
  await staff.getByRole('button', { name: 'Issue and print' }).click()
  await staff.getByRole('button', { name: 'Send claim link to contractor' }).click()
  await expect(
    staff.getByRole('status').filter({ hasText: 'Claim link sent to the contractor.' }),
  ).toBeVisible()
  const message = await waitForEmail({
    to: job.email,
    since,
    subject: 'Claim your project in Chiban',
    containing: CLAIM_PREFIX,
  })
  return { job, link: linkIn(message, CLAIM_PREFIX) }
}

export async function claimAs(contractor: Page, email: string, link: string): Promise<void> {
  await contractor.goto(link)
  await contractor.getByRole('link', { name: 'Sign in to claim' }).click()
  await signInWithMagicLink(contractor, email)
  await expect(contractor).toHaveURL(`/claim/${link.slice(CLAIM_PREFIX.length)}`)
  await contractor.getByRole('button', { name: 'Claim this project' }).click()
  await expect(contractor).toHaveURL('/portal/contractor')
}
