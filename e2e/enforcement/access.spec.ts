import { expect, test } from '../fixtures/test'
import { messageAlert } from '../public/alert'
import { caseAt } from './support'

const OSPREY = '17 Osprey Landing'
const REFUSAL = 'You do not have permission to see code enforcement cases.'
const OPEN_A_CASE = 'Open a case'
const ADD_A_NOTE = 'Add a note'
const REFER = 'Refer to counsel'
const RECORD_FINE = 'Record a court-imposed fine'

test.describe('who can open and use the enforcement pages', () => {
  for (const role of ['records', 'reviewer', 'board'] as const) {
    test.describe(`as ${role}`, () => {
      test.use({ role })

      test('is refused the queue and a case page', async ({ page, db }) => {
        await page.goto('/staff/enforcement')
        await expect(messageAlert(page)).toHaveText(REFUSAL)
        await expect(page.getByRole('button', { name: OPEN_A_CASE })).toHaveCount(0)
        await page.goto(`/staff/enforcement/${await caseAt(db, OSPREY)}`)
        await expect(messageAlert(page)).toHaveText(REFUSAL)
        await expect(page.locator('summary', { hasText: ADD_A_NOTE })).toHaveCount(0)
      })
    })
  }

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('can work the case but not refer it to counsel, fine or take payment', async ({
      page,
      db,
    }) => {
      await page.goto('/staff/enforcement')
      await expect(page.getByRole('button', { name: OPEN_A_CASE })).toBeVisible()
      await page.goto(`/staff/enforcement/${await caseAt(db, OSPREY)}`)
      await expect(page.locator('summary', { hasText: ADD_A_NOTE })).toBeVisible()
      await expect(page.locator('summary', { hasText: REFER })).toHaveCount(0)
      await expect(page.locator('summary', { hasText: RECORD_FINE })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0)
    })
  })

  test.describe('as finance', () => {
    test.use({ role: 'finance' })

    test('sees fines and payments but no case-work forms', async ({ page, db }) => {
      await page.goto('/staff/enforcement')
      await expect(page.getByRole('heading', { level: 1, name: 'Code enforcement' })).toBeVisible()
      await expect(page.getByRole('button', { name: OPEN_A_CASE })).toHaveCount(0)
      await page.goto(`/staff/enforcement/${await caseAt(db, OSPREY)}`)
      await expect(page.locator('summary', { hasText: RECORD_FINE })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Record payment' }).first()).toBeVisible()
      await expect(page.locator('summary', { hasText: ADD_A_NOTE })).toHaveCount(0)
      await expect(page.locator('summary', { hasText: REFER })).toHaveCount(0)
      await expect(page.locator('summary', { hasText: 'Record a finding' })).toHaveCount(0)
    })
  })

  test.describe('as the administrator', () => {
    test.use({ role: 'admin' })

    test('can refer and fine but has no case-work forms', async ({ page, db }) => {
      await page.goto('/staff/enforcement')
      await expect(page.getByRole('button', { name: OPEN_A_CASE })).toHaveCount(0)
      await page.goto(`/staff/enforcement/${await caseAt(db, OSPREY)}`)
      await expect(page.locator('summary', { hasText: REFER })).toBeVisible()
      await expect(page.locator('summary', { hasText: RECORD_FINE })).toBeVisible()
      await expect(page.locator('summary', { hasText: ADD_A_NOTE })).toHaveCount(0)
    })
  })
})
