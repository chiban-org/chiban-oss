import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import {
  counterJob,
  fillElectricalJob,
  licenseApplication,
  openElectricalForm,
} from './counterSupport'

async function startCardPayment(page: Page, suffix: string) {
  const job = counterJob(suffix)
  await openElectricalForm(page)
  await fillElectricalJob(page, job)
  await page.getByLabel('Card', { exact: true }).click()
  await expect(
    page.getByText(/^SIMULATED card reader: this counter is not connected/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Issue and print' }).click()
  const reader = page.getByRole('region', { name: 'Card reader' })
  await expect(reader.getByRole('heading', { name: 'Present card on reader' })).toBeVisible()
  return { job, reader }
}

test.describe('taking a card at the counter with the simulated reader', () => {
  test.use({ role: 'staff' })

  test('a declined card issues nothing, and approving on the next try issues the permit', async ({
    page,
    db,
    suffix,
  }) => {
    const { job, reader } = await startCardPayment(page, suffix)
    await reader.getByRole('button', { name: 'Decline' }).click()

    await expect(reader.getByRole('status')).toHaveText(
      'Card declined. The permit is not issued. Try the card again or choose another way to pay.',
    )
    expect((await licenseApplication(db, job.license)).state).toBe('submitted')

    await page.getByRole('button', { name: 'Issue and print' }).click()
    await page
      .getByRole('region', { name: 'Card reader' })
      .getByRole('button', { name: 'Approve' })
      .click()
    const issued = page.getByRole('status').filter({ hasText: / is issued$/ })
    await expect(issued).toBeVisible()
    const row = await licenseApplication(db, job.license)
    expect(row.state).toBe('issued')
    await expect(issued).toHaveText(`${row.number} is issued`)
  })

  test('a lost connection says do not issue, and the reconnect approval issues the permit', async ({
    page,
    db,
    suffix,
  }) => {
    const { job, reader } = await startCardPayment(page, suffix)
    await reader.getByRole('button', { name: 'Lose connection' }).click()

    await expect(reader.getByRole('alert')).toHaveText('Outcome unknown. Do not issue.')
    expect((await licenseApplication(db, job.license)).state).toBe('submitted')
    await reader.getByRole('button', { name: 'Check with processor' }).click()
    await expect(reader.getByRole('status')).toHaveText(
      'The processor has not reported an outcome yet. Check again in a moment.',
    )

    await reader.getByRole('button', { name: 'Reader reconnected: approved' }).click()
    const issued = page.getByRole('status').filter({ hasText: / is issued$/ })
    await expect(issued).toBeVisible()
    expect((await licenseApplication(db, job.license)).state).toBe('issued')
  })
})
