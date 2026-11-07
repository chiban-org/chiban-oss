import { accountFor, expect, test } from '../fixtures/test'
import {
  expectConfirmation,
  expectRefusedBeside,
  moreActions,
  moveCaseTo,
  openSummary,
  startCase,
} from './support'

const CASE_STATUS = 'select status from enforcement_cases where id = $1'

test.describe('moving, assigning and locating a case', () => {
  test.use({ role: 'staff' })

  test('closes a case only after a reason and a confirmed dialog', async ({ page, db, suffix }) => {
    const caseId = await startCase(page, `61 Wren Pass ${suffix}`)
    await moveCaseTo(page, 'Under investigation')
    await moveCaseTo(page, 'No violation found')
    const more = await moreActions(page)
    const close = await openSummary(more, 'Close the case')
    const reasonField = close.getByLabel(/^Reason for closing/)
    await close.getByRole('button', { name: 'Close the case', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Close this case?' })).toHaveCount(0)
    await expect(reasonField).toHaveAttribute('aria-invalid', 'true')

    const reason = `No violation on re-inspection, ref ${suffix}`
    await reasonField.fill(reason)
    await close.getByRole('button', { name: 'Close the case', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Close this case?' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    const open = await db.one<{ status: string }>(
      'select status from enforcement_cases where id = $1',
      [caseId],
    )
    expect(open.status).toBe('no_violation')

    await close.getByRole('button', { name: 'Close the case', exact: true }).click()
    await dialog.getByRole('button', { name: 'Close the case' }).click()
    await expectConfirmation(page, 'Status changed.')
    await expect
      .poll(async () => (await db.one<{ status: string }>(CASE_STATUS, [caseId])).status)
      .toBe('closed')
    const closed = await db.one<{ status: string; closure_reason: string }>(
      'select status, closure_reason from enforcement_cases where id = $1',
      [caseId],
    )
    expect(closed).toEqual({ status: 'closed', closure_reason: reason })
  })

  test('reassigns a case to the inspector and stores the assignee', async ({
    page,
    db,
    suffix,
  }) => {
    const caseId = await startCase(page, `62 Wren Pass ${suffix}`)
    const assignment = page.getByRole('region', { name: 'Assignment' })
    const form = await openSummary(assignment, 'Reassign the case')
    await form.getByLabel('Assign to').selectOption({ label: accountFor('inspector').displayName })
    await form.getByRole('button', { name: 'Reassign' }).click()
    await expectConfirmation(page, 'Case reassigned.')
    const row = await db.one<{ assigned_to: string }>(
      'select assigned_to from enforcement_cases where id = $1',
      [caseId],
    )
    expect(row.assigned_to).toBe(await db.userIdFor(accountFor('inspector').email))
  })

  test('links a parcel picked from the list and refuses text that was never picked', async ({
    page,
    db,
    suffix,
  }) => {
    const caseId = await startCase(page, `63 Wren Pass ${suffix}`)
    const form = await openSummary(page.locator('aside'), 'Link a parcel')
    const picker = form.getByRole('combobox', { name: 'Parcel' })
    await picker.fill('12 Tamarack Way')
    await form.getByRole('button', { name: 'Link the case to a parcel' }).click()
    await expectRefusedBeside(picker, 'Check: Parcel.')
    const before = await db.one<{ parcel_id: string | null }>(
      'select parcel_id from enforcement_cases where id = $1',
      [caseId],
    )
    expect(before.parcel_id).toBeNull()

    await picker.fill('')
    await picker.fill('12 Tamarack')
    await page
      .getByRole('listbox', { name: 'Matching parcels' })
      .getByRole('option')
      .first()
      .click()
    await form.getByRole('button', { name: 'Link the case to a parcel' }).click()
    await expectConfirmation(page, 'Parcel linked.')
    const after = await db.one<{ parcel_id: string | null }>(
      'select parcel_id from enforcement_cases where id = $1',
      [caseId],
    )
    expect(after.parcel_id).not.toBeNull()
  })
})
