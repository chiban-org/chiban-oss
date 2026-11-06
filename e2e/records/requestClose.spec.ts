import { confirmDialog } from '../boards/confirm'
import { expect, test } from '../fixtures/test'
import { expectToast, logRequestViaForm, openDetails, openRequest } from './requestSupport'

test.use({ role: 'records' })

test.describe('closing a Right-to-Know request', () => {
  test('keeps the request open when the confirmation is declined, then withdraws it when confirmed', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Zoning map copies, close ${suffix}`)
    await openRequest(page, id)
    const rail = page.getByRole('complementary')
    await openDetails(rail, 'Close the request')
    await rail.getByLabel('Close it as').selectOption('withdrawn')
    await rail.getByRole('button', { name: 'Close request' }).click()
    const dialog = confirmDialog(page, 'Close this records request?')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep it open' }).click()
    await expect(dialog).toHaveCount(0)
    const kept = await db.one<{ status: string }>('select status from rtk_requests where id = $1', [
      id,
    ])
    expect(kept.status).toBe('open')

    await rail.getByRole('button', { name: 'Close request' }).click()
    await dialog.getByRole('button', { name: 'Close the request' }).click()
    await expectToast(page, 'Request updated.')
    await expect(page.getByText('Withdrawn by the requester').first()).toBeVisible()
    await expect(rail.getByText('Close the request')).toHaveCount(0)
    const closed = await db.one<{ status: string }>(
      'select status from rtk_requests where id = $1',
      [id],
    )
    expect(closed.status).toBe('withdrawn')
  })
})
