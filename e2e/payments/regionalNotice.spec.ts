import type { Page } from '@playwright/test'
import { type E2eDb, expect, test } from '../fixtures/test'
import { applicationByNumber, expectConfirmation, expectRefusedBeside } from './support'

const PERMIT = 'BP-2026-0002'

function panel(page: Page) {
  return page.getByRole('region', { name: 'Regional impact' })
}

async function noticeCount(db: E2eDb, applicationId: string): Promise<number> {
  const row = await db.one<{ count: string }>(
    'select count(*) from regional_impact_notices where application_id = $1',
    [applicationId],
  )
  return Number(row.count)
}

test.describe
  .serial('recording a regional impact notice', () => {
    test.describe('as staff', () => {
      test.use({ role: 'staff' })

      test('refuses a blank recipient name beside the field and stores nothing', async ({
        page,
        db,
      }) => {
        const applicationId = await applicationByNumber(page, db, PERMIT)
        const before = await noticeCount(db, applicationId)
        await panel(page).getByText('Record a notice', { exact: true }).click()
        await panel(page).getByRole('button', { name: 'Record notice' }).click()
        const field = panel(page).getByLabel(/^Recipient name/)
        await expectRefusedBeside(field, 'Fill in: Recipient name.')
        expect(await noticeCount(db, applicationId)).toBe(before)
      })

      test('records a notice and stores the recipient and method', async ({ page, db, suffix }) => {
        const name = `Town of Pine River ${suffix}`
        const applicationId = await applicationByNumber(page, db, PERMIT)
        await panel(page).getByText('Record a notice', { exact: true }).click()
        await panel(page)
          .getByLabel('Recipient', { exact: true })
          .selectOption({ label: 'Affected municipality' })
        await panel(page)
          .getByLabel(/^Recipient name/)
          .fill(name)
        await panel(page).getByRole('button', { name: 'Record notice' }).click()
        await expectConfirmation(page, 'Notice recorded.')
        await expect(panel(page).getByText(new RegExp(`^${name}`))).toBeVisible()
        const row = await db.one<{ recipient_kind: string; method: string }>(
          'select recipient_kind, method from regional_impact_notices where application_id = $1 and recipient_name = $2',
          [applicationId, name],
        )
        expect(row).toEqual({ recipient_kind: 'affected_municipality', method: 'certified_mail' })
      })
    })

    test.describe('as finance', () => {
      test.use({ role: 'finance' })

      test('the record notice form is absent', async ({ page, db }) => {
        await applicationByNumber(page, db, PERMIT)
        await expect(panel(page).getByRole('heading', { name: 'Regional impact' })).toBeVisible()
        await expect(page.getByText('Record a notice', { exact: true })).toHaveCount(0)
      })
    })
  })
