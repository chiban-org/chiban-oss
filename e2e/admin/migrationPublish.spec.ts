import { expect, test } from '../fixtures/test'
import { expectConfirmation } from './support'

test.use({ role: 'admin' })

const BATCH_NAME = 'Town Hall basement scans'

test.describe('scanned property file batch', () => {
  test('lets a publisher publish a staged batch, making only the files with a parcel public', async ({
    page,
    pageAs,
    db,
  }) => {
    const batch = await db.one<{ id: string; status: string }>(
      'select id, status from migration_batches where name = $1',
      [BATCH_NAME],
    )
    expect(batch.status).toBe('staged')
    const publicBefore = await db.rows(
      'select 1 from documents where migration_batch_id = $1 and is_public',
      [batch.id],
    )
    expect(publicBefore).toHaveLength(0)

    await page.goto('/staff/admin/migration')
    await page.getByRole('link', { name: BATCH_NAME }).click()
    await expect(page).toHaveURL(new RegExp(`/staff/admin/migration/${batch.id}$`))
    await expect(page.getByRole('note')).toContainText('ask a staff member who may show documents')
    await expect(
      page.getByRole('button', { name: 'Show this batch on the public site' }),
    ).toHaveCount(0)

    const publisher = await pageAs('staff')
    await publisher.goto(`/staff/admin/migration/${batch.id}`)
    await publisher.getByRole('button', { name: 'Show this batch on the public site' }).click()
    await expectConfirmation(publisher, 'Files whose parcel was not found stay private.')

    const publicAfter = await db.rows(
      'select 1 from documents where migration_batch_id = $1 and is_public',
      [batch.id],
    )
    expect(publicAfter.length).toBeGreaterThan(0)
    const all = await db.rows('select 1 from documents where migration_batch_id = $1', [batch.id])
    expect(publicAfter.length).toBeLessThan(all.length)
  })
})
