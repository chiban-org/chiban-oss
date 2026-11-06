import type { Page } from '@playwright/test'
import { confirmDialog } from '../boards/confirm'
import { expect, test } from '../fixtures/test'
import { runCamaImport } from './camaSupport'
import { expectRefusedBeside } from './refusal'
import { expectToast, openDetails } from './requestSupport'

test.use({ role: 'staff' })

function exceptionCard(page: Page, owner: string) {
  return page.locator('li.exception-card').filter({ hasText: owner })
}

test.describe('owner changes held by a CAMA import', () => {
  test('applies one held owner change to the parcel', async ({ page, db, suffix }) => {
    const owner = `Applied Owner ${suffix}`
    await runCamaImport(page, [{ mapLot: '007004', owner }])
    await page.goto('/staff/gis/exceptions')
    const card = exceptionCard(page, owner)
    await expect(card).toHaveCount(1)
    await card.getByRole('button', { name: 'Apply the change' }).click()
    await expectToast(page, 'Held row applied.')
    const parcel = await db.one<{ owner_name: string }>(
      `select p.owner_name from parcels p
       join parcel_aliases a on a.parcel_id = p.id
       where a.format = 'gis12' and a.value = '007004000000'`,
    )
    expect(parcel.owner_name).toBe(owner)
  })

  test('accepts every held owner change of one import at once', async ({ page, db, suffix }) => {
    const first = `Bulk Owner A ${suffix}`
    const second = `Bulk Owner B ${suffix}`
    const runId = await runCamaImport(page, [
      { mapLot: '007005', owner: first },
      { mapLot: '007006', owner: second },
    ])
    await page.goto('/staff/gis/exceptions')
    const run = page
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="/staff/gis/imports/${runId}"]`) })
    await expect(run).toContainText('2 owner changes held')
    await run.getByRole('button', { name: 'Accept all owner changes from this import' }).click()
    await expectToast(page, 'Accepted 2 owner changes.')
    const rows = await db.rows<{ status: string }>(
      "select status from import_exceptions where last_seen_run_id = $1 and kind = 'owner_changed'",
      [runId],
    )
    expect(rows.map((r) => r.status)).toEqual(['accepted', 'accepted'])
  })

  test('dismisses a held change only after a reason is given and confirmed', async ({
    page,
    db,
    suffix,
  }) => {
    const owner = `Dismissed Owner ${suffix}`
    await runCamaImport(page, [{ mapLot: '007007', owner }])
    await page.goto('/staff/gis/exceptions')
    const card = exceptionCard(page, owner)
    await openDetails(card, 'Dismiss')
    const reason = card.getByLabel('Reason')
    const dialog = confirmDialog(page, 'Dismiss this exception?')
    await card.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expectRefusedBeside(reason, 'Fill in: Reason.')
    await expect(dialog).toHaveCount(0)

    await reason.fill(`The stored owner is right, ${suffix}`)
    await card.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expectToast(page, 'Exception dismissed.')
    const row = await db.one<{ status: string }>(
      'select status from import_exceptions where disposition_reason = $1',
      [`The stored owner is right, ${suffix}`],
    )
    expect(row.status).toBe('dismissed')
  })
})

test.describe('exceptions as an inspector', () => {
  test.use({ role: 'inspector' })

  test('sees no way to apply, accept or dismiss', async ({ page }) => {
    await page.goto('/staff/gis/exceptions')
    await expect(page.getByRole('button', { name: 'Apply the change' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Accept all owner changes/ })).toHaveCount(0)
    await expect(page.getByText('Dismiss', { exact: true })).toHaveCount(0)
  })
})
