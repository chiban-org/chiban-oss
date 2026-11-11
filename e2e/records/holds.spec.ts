import { confirmDialog } from '../boards/confirm'
import { expect, test } from '../fixtures/test'
import { expectRefusedBeside } from './refusal'
import { expectToast, openDetails } from './requestSupport'

test.use({ role: 'records' })

const DOCUMENT = 'Owner letter for the Birch Lane renovation'

test.describe('legal holds', () => {
  test('refuses a short reason beside the field and places nothing', async ({ page, db }) => {
    await page.goto('/staff/records/holds')
    await page.getByRole('button', { name: 'Place a hold' }).click()
    const dialog = page.getByRole('dialog', { name: 'Place a legal hold' })
    await dialog.getByLabel('Hold on').selectOption('document')
    await dialog
      .getByLabel(
        'Application number, case number, request number, project title, or document title',
      )
      .fill(DOCUMENT)
    const reason = dialog.getByLabel('Reason (at least 10 characters)')
    await reason.fill('short')
    await dialog.getByRole('button', { name: 'Place hold' }).click()
    await expectRefusedBeside(reason, 'Enter a reason of at least 10 characters.')
    const rows = await db.rows("select 1 from legal_holds where reason = 'short'")
    expect(rows).toHaveLength(0)
  })

  test('refuses a record that does not exist beside the reference field', async ({
    page,
    db,
    suffix,
  }) => {
    await page.goto('/staff/records/holds')
    await page.getByRole('button', { name: 'Place a hold' }).click()
    const dialog = page.getByRole('dialog', { name: 'Place a legal hold' })
    await dialog.getByLabel('Hold on').selectOption('document')
    const reference = dialog.getByLabel(
      'Application number, case number, request number, project title, or document title',
    )
    await reference.fill(`No such document ${suffix}`)
    await dialog.getByLabel('Reason (at least 10 characters)').fill(`Litigation hold ${suffix}`)
    await dialog.getByRole('button', { name: 'Place hold' }).click()
    await expectRefusedBeside(reference, 'No record was found with that reference.')
    const rows = await db.rows('select 1 from legal_holds where reason = $1', [
      `Litigation hold ${suffix}`,
    ])
    expect(rows).toHaveLength(0)
  })

  test('places a hold on a document, then releases it only after a valid reason is confirmed', async ({
    page,
    db,
    suffix,
  }) => {
    const reason = `Litigation hold on the owner letter, ${suffix}`
    await page.goto('/staff/records/holds')
    await page.getByRole('button', { name: 'Place a hold' }).click()
    const place = page.getByRole('dialog', { name: 'Place a legal hold' })
    await place.getByLabel('Hold on').selectOption('document')
    await place
      .getByLabel(
        'Application number, case number, request number, project title, or document title',
      )
      .fill(DOCUMENT)
    await place.getByLabel('Reason (at least 10 characters)').fill(reason)
    await place.getByRole('button', { name: 'Place hold' }).click()
    await expectToast(page, 'Legal hold placed.')
    const hold = await db.one<{ id: string; target_kind: string; released_at: Date | null }>(
      'select id, target_kind, released_at from legal_holds where reason = $1',
      [reason],
    )
    expect(hold.target_kind).toBe('document')
    expect(hold.released_at).toBeNull()

    await page.goto('/staff/records/holds')
    const row = page.getByRole('row').filter({ hasText: reason })
    await expect(row.getByRole('link', { name: DOCUMENT })).toBeVisible()
    await openDetails(row, 'Release')
    const releaseReason = row.getByLabel('Release reason (at least 10 characters)')
    const dialog = confirmDialog(page, 'Release this hold?')
    await releaseReason.fill('short')
    await row.getByRole('button', { name: 'Release hold' }).click()
    await expectRefusedBeside(releaseReason, 'Enter a reason of at least 10 characters.')
    await expect(dialog).toHaveCount(0)

    await releaseReason.fill(`Case settled, ${suffix}`)
    await row.getByRole('button', { name: 'Release hold' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Release the hold' }).click()
    await expectToast(page, 'Legal hold released.')
    const released = await db.one<{ release_reason: string; released_at: Date | null }>(
      'select release_reason, released_at from legal_holds where id = $1',
      [hold.id],
    )
    expect(released.release_reason).toBe(`Case settled, ${suffix}`)
    expect(released.released_at).not.toBeNull()
  })
})

test.describe('holds as a clerk', () => {
  test.use({ role: 'staff' })

  test('cannot see the place a hold form and the holds URL refuses', async ({ page }) => {
    await page.goto('/staff/records/holds')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to manage legal holds.',
    )
    await expect(page.getByRole('button', { name: 'Place a hold' })).toHaveCount(0)
  })
})
