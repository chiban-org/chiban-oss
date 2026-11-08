import type { Locator } from '@playwright/test'
import { expect, test } from '../fixtures/test'
import {
  daysFromTownToday,
  openDialog,
  openMore,
  openRoster,
  pickParcel,
  rosterRow,
} from './rosterSupport'
import { confirmWith, expectConfirmation, expectRefusedBeside } from './support'

const PARK_PARCEL = '009015000000'
const PARK_OWNER = 'Teal Marsh Holdings LLC'
const OWNER_ADDRESS = '8 Teal Marsh Road, Alder Pond NH 03999'

test.describe
  .serial('manufactured housing parks on the notice roster', () => {
    test.use({ role: 'staff' })
    let park = ''

    async function fillPark(dialog: Locator, parkName: string) {
      await dialog.getByLabel(/^Park name/).fill(parkName)
      await dialog.getByLabel(/^Owner name/).fill(PARK_OWNER)
      await dialog.getByLabel(/^Owner mailing address/).fill(OWNER_ADDRESS)
      await dialog.getByLabel(/^Name/).fill('Robin Tenant')
      await dialog.getByLabel(/^Site/).fill('Site 12')
      await dialog.getByLabel(/^Mailing address/).fill('12 Teal Marsh Road, Alder Pond NH 03999')
    }

    test('refuses a park name of only spaces beside the name and stores nothing', async ({
      page,
      db,
    }) => {
      await openRoster(page, { kind: 'parks' })
      const dialog = await openDialog(page, 'Add park', 'Add a manufactured housing park')
      await pickParcel(dialog, '009015', new RegExp(`^${PARK_PARCEL}`))
      await fillPark(dialog, '   ')
      await dialog.getByRole('button', { name: 'Add park' }).click()
      await expectRefusedBeside(dialog.getByLabel(/^Park name/), 'Enter the park name.')
      const rows = await db.rows('select 1 from park_rosters where owner_name = $1', [PARK_OWNER])
      expect(rows).toEqual([])
    })

    test('adds a park with a tenant and stores the roster row', async ({ page, db, suffix }) => {
      park = `Teal Marsh Park ${suffix}`
      await openRoster(page, { kind: 'parks' })
      const dialog = await openDialog(page, 'Add park', 'Add a manufactured housing park')
      await pickParcel(dialog, '009015', new RegExp(`^${PARK_PARCEL}`))
      await fillPark(dialog, park)
      await dialog.getByRole('button', { name: 'Add park' }).click()
      await expectConfirmation(page, 'Park added.')
      const row = await db.one<{ owner_name: string; tenants: { name: string }[] }>(
        'select owner_name, tenants from park_rosters where park_name = $1',
        [park],
      )
      expect(row.owner_name).toBe(PARK_OWNER)
      expect(row.tenants).toEqual([expect.objectContaining({ name: 'Robin Tenant' })])
    })

    test('updates the park owner and stores it', async ({ page, db }) => {
      await openRoster(page, { kind: 'parks', q: park })
      await expect(rosterRow(page, park).getByText('1 tenant', { exact: true })).toBeVisible()
      await rosterRow(page, park)
        .getByRole('button', { name: `Edit ${park}` })
        .click()
      const dialog = page.getByRole('dialog', { name: `Edit ${park}` })
      await dialog.getByLabel(/^Owner name/).fill('Teal Marsh Partners LLC')
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expectConfirmation(page, 'Park saved.')
      const row = await db.one<{ owner_name: string }>(
        'select owner_name from park_rosters where park_name = $1',
        [park],
      )
      expect(row.owner_name).toBe('Teal Marsh Partners LLC')
    })

    test('ends the park after the dialog and undoes the ending', async ({ page, db }) => {
      await openRoster(page, { kind: 'parks', q: park })
      const title = `End ${park} on ${PARK_PARCEL}`
      await openMore(page, park)
      await page.getByRole('button', { name: title }).click()
      await page
        .getByRole('dialog', { name: title })
        .getByRole('button', { name: 'End park' })
        .click()
      await confirmWith(page, `${title}?`, 'End park')
      await expectConfirmation(page, 'Park ended.')
      const ended = await db.one<{ ended_on: string }>(
        'select ended_on::text from park_rosters where park_name = $1',
        [park],
      )
      expect(ended.ended_on).toBe(await daysFromTownToday(db, 0))
      await openRoster(page, { kind: 'parks', q: park, status: 'ended' })
      await openMore(page, park)
      await page.getByRole('button', { name: `Undo ending ${park} on ${PARK_PARCEL}` }).click()
      await expectConfirmation(page, 'The ending was undone.')
      const undone = await db.one<{ ended_on: string | null }>(
        'select ended_on::text from park_rosters where park_name = $1',
        [park],
      )
      expect(undone.ended_on).toBeNull()
    })
  })
