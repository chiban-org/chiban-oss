import { expect, test } from '../fixtures/test'
import { applicationIdFor, demoTitle, openApplication } from './support'

const ADDITION = demoTitle('Addition under review')

test.describe('conditions on an application', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('applies a condition from the library and marks it met', async ({ page, db }) => {
      const id = await applicationIdFor(db, ADDITION)
      await openApplication(page, db, ADDITION)
      const conditions = page.getByRole('region', { name: 'Conditions' })
      await conditions.getByText('Apply a condition', { exact: true }).click()
      const choice = conditions.getByLabel('Condition', { exact: true })
      const code = await choice.locator('option').first().getAttribute('value')
      const text = (await choice.locator('option').first().textContent()) ?? ''
      await choice.selectOption({ index: 0 })
      await conditions.getByRole('button', { name: 'Apply condition' }).click()

      const item = conditions.getByRole('listitem').filter({ hasText: text })
      await expect(item).toContainText('Unmet')
      const applied = await db.one<{ status: string }>(
        'select status from application_conditions where application_id = $1 and code = $2',
        [id, code],
      )
      expect(applied.status).toBe('unmet')

      await item.getByRole('button', { name: 'Mark met' }).click()
      await expect(item).toContainText('Met')
      await expect(item.getByRole('button', { name: 'Mark met' })).toHaveCount(0)
      const met = await db.one<{ status: string }>(
        'select status from application_conditions where application_id = $1 and code = $2',
        [id, code],
      )
      expect(met.status).toBe('met')
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('sees no way to apply a condition', async ({ page, db }) => {
      await openApplication(page, db, ADDITION)
      await expect(page.getByText('Apply a condition', { exact: true })).toHaveCount(0)
    })
  })
})
