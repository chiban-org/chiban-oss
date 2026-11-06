import { expect, test } from '../fixtures/test'
import { applicationIdFor } from './records'
import { expectRefused } from './refusal'

test.describe
  .serial('parcels on a board application', () => {
    test.use({ role: 'staff' })
    let applicationId: string

    test('refuses adding a parcel before one is chosen', async ({ page, db }) => {
      applicationId = await applicationIdFor(db, 'Loon Cove site plan')
      await page.goto(`/staff/applications/${applicationId}`)
      const lists = page.getByRole('region', { name: 'Abutter lists' })
      await lists.getByText('Add a parcel to this application', { exact: true }).click()
      await lists.getByRole('button', { name: 'Add parcel' }).click()
      await expectRefused(lists.getByRole('combobox', { name: /^Parcel/ }), 'Fill in: Parcel.')
    })

    test('finds a parcel by number and adds it to the application', async ({ page }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const lists = page.getByRole('region', { name: 'Abutter lists' })
      await lists.getByText('Add a parcel to this application', { exact: true }).click()
      await lists.getByRole('combobox', { name: /^Parcel/ }).fill('009014')
      await page.getByRole('option', { name: /^009014000000/ }).click()
      await lists.getByRole('button', { name: 'Add parcel' }).click()
      await expect(lists.getByText('Parcels for this application updated.')).toBeVisible()
      await expect(lists.getByText(/^Parcels: .*009014000000/)).toBeVisible()
    })
  })
