import { expect, test } from '../fixtures/test'
import { freshGisIds, parcelIdOfGis, pickParcel, recordSubdivision } from './parcelSupport'
import { expectRefusedBeside } from './refusal'
import { expectToast } from './requestSupport'

test.use({ role: 'staff' })

test.describe('carrying a record forward to a child parcel', () => {
  test('moves an inherited record onto the child and stores the carry forward', async ({
    page,
    db,
  }) => {
    const [child = '', sibling = ''] = freshGisIds(2)
    await recordSubdivision(page, { query: '14 Alder Pond', option: '14 Alder Pond Road' }, [
      child,
      sibling,
    ])
    const childParcel = await parcelIdOfGis(db, child)
    await page.goto(`/staff/parcels/${childParcel}`)
    const carry = page.getByRole('button', { name: 'Carry forward to this parcel' }).first()
    await expect(carry).toBeVisible()
    await carry.click()
    await expectToast(page, 'Record carried forward.')
    const rows = await db.rows(
      'select 1 from parcel_record_carry_forwards where to_parcel_id = $1',
      [childParcel],
    )
    expect(rows).toHaveLength(1)
  })
})

test.describe('resolving an unresolved record', () => {
  test('refuses text that was not picked from the list, then links the record to the picked parcel', async ({
    page,
    db,
  }) => {
    await page.goto('/staff/parcels/unresolved')
    const row = page.getByRole('row').filter({ hasText: '008099000000' })
    const field = row.getByRole('combobox')
    await field.fill('12 Birch Hollow')
    await row.getByRole('button', { name: 'Link to parcel' }).click()
    await expectRefusedBeside(field, 'Check: Parcel for Demo record.')
    const unlinked = await db.rows(
      "select 1 from parcel_record_links where raw_ref_value = '008099000000' and parcel_id is null",
    )
    expect(unlinked).toHaveLength(1)

    await field.fill('')
    await pickParcel(field, '12 Birch Hollow', '12 Birch Hollow Road')
    await row.getByRole('button', { name: 'Link to parcel' }).click()
    await expectToast(page, 'Record linked.')
    await expect(page.getByRole('row').filter({ hasText: '008099000000' })).toHaveCount(0)
    const linked = await db.rows(
      "select parcel_id from parcel_record_links where record_id = '00000000-0000-4000-8000-0000000000a1' and parcel_id is not null",
    )
    expect(linked).toHaveLength(1)
  })
})

test.describe('unresolved records as an inspector', () => {
  test.use({ role: 'inspector' })

  test('cannot see the link form and the URL refuses', async ({ page }) => {
    await page.goto('/staff/parcels/unresolved')
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'You do not have permission to see unresolved records.',
    )
  })
})
