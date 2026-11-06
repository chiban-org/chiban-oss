import { expect, test } from '../fixtures/test'
import { applicationIdFor, townToday } from './records'
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

test.describe
  .serial('selectmen certification after a decision', () => {
    test.use({ role: 'staff' })

    test('records that the selectmen certified the plan', async ({ page, db }) => {
      const id = await applicationIdFor(db, 'Brookview minor site plan')
      await page.goto(`/staff/applications/${id}`)
      const follow = page.getByRole('region', { name: 'Decision follow-up' })
      await follow.getByText('Record a request to the selectmen', { exact: true }).click()
      await follow.getByLabel(/^Outcome/).selectOption('certified')
      await follow.getByLabel('Date decided, if certified').fill(await townToday(db))
      await follow.getByRole('button', { name: 'Record', exact: true }).click()
      await expect(follow.getByText(/: certified by the selectmen$/)).toBeVisible()
    })
  })
