import { confirmDialog } from '../boards/confirm'
import { expect, test } from '../fixtures/test'
import { expectToast, logRequestViaForm, openDetails, openRequest } from './requestSupport'

test.use({ role: 'records' })

test.describe('closing a Right-to-Know request', () => {
  test('keeps the request open when the confirmation is declined, then marks it withdrawn when confirmed', async ({
    page,
    db,
    suffix,
  }) => {
    const id = await logRequestViaForm(page, db, `Zoning map copies, close ${suffix}`)
    await openRequest(page, id)
    const rail = page.getByRole('complementary')
    await openDetails(rail, 'More actions')
    await rail.getByRole('button', { name: 'Mark withdrawn' }).click()
    const dialog = confirmDialog(page, /^Mark request RK-\d{4}-\d{4} withdrawn\?$/)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep it open' }).click()
    await expect(dialog).toHaveCount(0)
    const kept = await db.one<{ status: string }>('select status from rtk_requests where id = $1', [
      id,
    ])
    expect(kept.status).toBe('open')

    await rail.getByRole('button', { name: 'Mark withdrawn' }).click()
    await dialog.getByRole('button', { name: 'Mark it withdrawn' }).click()
    await expectToast(page, 'Request updated.')
    await expect(page.getByText('The requester withdrew this request.')).toBeVisible()
    await expect(rail.getByText('More actions')).toHaveCount(0)
    const closed = await db.one<{ status: string }>(
      'select status from rtk_requests where id = $1',
      [id],
    )
    expect(closed.status).toBe('withdrawn')
  })
})
