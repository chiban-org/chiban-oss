import { expect, test } from '../fixtures/test'
import { demoTitle, expectRefusedBeside, openApplication } from './support'

const GATE = 'Assigned reviews signed off'

test.describe('overriding an administrative gate', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('refuses a short reason beside the field and records nothing', async ({ page, db }) => {
      const id = await openApplication(page, db, demoTitle('Addition under review'))
      const gates = page.getByRole('region', { name: 'Gates', exact: true })
      await gates.getByText('Override this gate', { exact: true }).click()
      await gates.getByLabel('Reason (at least 10 characters)').fill('too short')
      await gates.getByRole('button', { name: 'Override with reason' }).click()

      await expectRefusedBeside(
        gates.getByLabel('Reason (at least 10 characters)'),
        'Enter a reason of at least 10 characters.',
      )
      const row = await db.one<{ count: string }>(
        'select count(*) from gate_overrides where application_id = $1',
        [id],
      )
      expect(Number(row.count)).toBe(0)
    })

    test('overrides the gate with a reason, then revokes it only after confirming', async ({
      page,
      db,
      suffix,
    }) => {
      const id = await openApplication(page, db, demoTitle('Addition under review'))
      const reason = `Reviewer on leave, cleared by the building official ${suffix}`
      const gates = page.getByRole('region', { name: 'Gates', exact: true })
      await gates.getByText('Override this gate', { exact: true }).click()
      await gates.getByLabel('Reason (at least 10 characters)').fill(reason)
      await gates.getByRole('button', { name: 'Override with reason' }).click()

      await expect(gates.getByRole('button', { name: 'Revoke override' })).toBeVisible()
      const stored = await db.one<{ reason: string }>(
        'select reason from gate_overrides where application_id = $1 and reason = $2',
        [id, reason],
      )
      expect(stored.reason).toBe(reason)

      await gates.getByRole('button', { name: 'Revoke override' }).click()
      const dialog = page.getByRole('dialog', { name: `Revoke the override on ${GATE}?` })
      await dialog.getByRole('button', { name: 'Revoke the override' }).click()
      await expect(gates.getByText('Override this gate', { exact: true })).toBeVisible()
      const left = await db.one<{ count: string }>(
        'select count(*) from gate_overrides where application_id = $1 and revoked_at is null',
        [id],
      )
      expect(Number(left.count)).toBe(0)
    })
  })

  test.describe('as the administrator', () => {
    test.use({ role: 'admin' })

    test('is not offered the override on an administrative gate', async ({ page, db }) => {
      await openApplication(page, db, demoTitle('Mudroom addition due this week'))
      const gates = page.getByRole('region', { name: 'Gates', exact: true })
      await expect(gates).toContainText(GATE)
      await expect(gates.getByText('Override this gate', { exact: true })).toHaveCount(0)
    })
  })
})
