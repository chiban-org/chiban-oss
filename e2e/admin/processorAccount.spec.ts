import { type E2eDb, expect, test } from '../fixtures/test'
import { expectConfirmation } from './support'

test.use({ role: 'admin' })

interface Account {
  processor: string
  mode: string
  account_ref: string
  is_active: boolean
}

async function activeAccount(db: E2eDb) {
  return await db.one<Account>(
    'select processor, mode, account_ref, is_active from processor_accounts where is_active',
  )
}

test.describe('card processor account', () => {
  test('refuses a blank account number beside the field and saves nothing', async ({
    page,
    db,
  }) => {
    const before = await db.rows('select 1 from processor_accounts')
    await page.goto('/staff/settings/payments')
    const account = page.getByLabel('Account number at the processor')
    await account.fill('')
    await page.getByLabel('Webhook signing secret').fill('whsec_e2e_placeholder')
    await page.getByRole('button', { name: 'Save processor account' }).click()
    await expect(account).toHaveAttribute('aria-invalid', 'true')
    expect(await db.rows('select 1 from processor_accounts')).toHaveLength(before.length)
  })

  test('saves the simulated practice account again with the same account number', async ({
    page,
    db,
  }) => {
    const before = await activeAccount(db)
    await page.goto('/staff/settings/payments')
    await page
      .locator('select[name="processor"]')
      .selectOption({ label: 'Simulated (practice only)' })
    await page.locator('select[name="mode"]').selectOption({ label: 'Test' })
    await page.getByLabel('Account number at the processor').fill(before.account_ref)
    await page.getByLabel('Webhook signing secret').fill('whsec_e2e_placeholder')
    await page.getByRole('button', { name: 'Save processor account' }).click()
    await expectConfirmation(
      page,
      'Processor account saved. The connection has not been verified yet.',
    )
    expect(await activeAccount(db)).toMatchObject({
      processor: before.processor,
      mode: before.mode,
      account_ref: before.account_ref,
    })
  })
})
