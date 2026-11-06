import type { Page } from '@playwright/test'
import { type E2eDb, expect, fillDate, test } from '../fixtures/test'
import { daysFromTownToday, openDialog, openRoster, pickParcel, rosterRow } from './rosterSupport'
import { confirmWith, expectConfirmation, expectRefusedBeside } from './support'

const CONDO_PARCEL = '007014000000'

test.describe
  .serial('condo associations on the notice roster', () => {
    test.use({ role: 'staff' })
    let name = ''
    let renamed = ''

    test('refuses a parcel that was typed but never picked, beside the parcel', async ({
      page,
      suffix,
    }) => {
      await openRoster(page)
      const dialog = await openDialog(page, 'Add association', 'Add a condo association')
      await dialog.getByRole('combobox', { name: /^Parcel/ }).fill('not a parcel')
      await dialog.getByLabel(/^Association name/).fill(`Heron Condominium ${suffix}`)
      await dialog.getByLabel(/^Name/).fill('Dana Officer')
      await dialog.getByLabel(/^Mailing address/).fill('PO Box 9, Alder Pond NH 03999')
      await dialog.getByRole('button', { name: 'Add association' }).click()
      await expectRefusedBeside(
        dialog.getByRole('combobox', { name: /^Parcel/ }),
        'Check: Parcel of the condominium.',
      )
    })

    test('adds an association with an officer and stores the roster row', async ({
      page,
      db,
      suffix,
    }) => {
      name = `Larkspur Condominium ${suffix}`
      await openRoster(page)
      const dialog = await openDialog(page, 'Add association', 'Add a condo association')
      await pickParcel(dialog, '007014', new RegExp(`^${CONDO_PARCEL}`))
      await dialog.getByLabel(/^Association name/).fill(name)
      await dialog.getByLabel(/^Name/).fill('Dana Officer')
      await dialog.getByLabel(/^Title/).fill('President')
      await dialog.getByLabel(/^Mailing address/).fill('PO Box 9, Alder Pond NH 03999')
      await dialog.getByRole('button', { name: 'Add association' }).click()
      await expectConfirmation(page, 'Association added.')
      const row = await db.one<{ officers: { name: string }[] }>(
        'select officers from association_rosters where association_name = $1',
        [name],
      )
      expect(row.officers).toEqual([expect.objectContaining({ name: 'Dana Officer' })])
    })

    test('updates the association name and stores it', async ({ page, db, suffix }) => {
      renamed = `${name} Renamed`
      await openRoster(page)
      await rosterRow(page, name)
        .getByRole('button', { name: `Edit ${name}` })
        .click()
      const dialog = page.getByRole('dialog', { name: `Edit ${name}` })
      await dialog.getByLabel(/^Association name/).fill(renamed)
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expectConfirmation(page, 'Association saved.')
      await db.one('select 1 from association_rosters where association_name = $1', [renamed])
    })

    test('confirms the entry is still correct and records the check date', async ({ page, db }) => {
      await openRoster(page)
      await page.getByRole('button', { name: `Confirm ${renamed} still correct` }).click()
      await expectConfirmation(page, 'Marked as still correct today.')
      const row = await db.one<{ checked_on: string | null }>(
        'select checked_on::text from association_rosters where association_name = $1',
        [renamed],
      )
      expect(row.checked_on).toBe(await daysFromTownToday(db, 0))
    })

    test('refuses an end date in the future beside the date and opens no confirm dialog', async ({
      page,
      db,
    }) => {
      await openRoster(page)
      const dialog = await openEnd(page)
      await fillDate(dialog.getByLabel(/^End on/), await daysFromTownToday(db, 30))
      await dialog.getByRole('button', { name: 'End association' }).click()
      await expectRefusedBeside(
        dialog.getByLabel(/^End on/),
        'Enter the end date between January 1, 1900 and',
      )
      await expect(page.getByRole('dialog', { name: `${endTitle()}?` })).toHaveCount(0)
      expect(await endedOn(db)).toBeNull()
    })

    test('refuses an end date before the list date beside the date', async ({ page, db }) => {
      await openRoster(page)
      const dialog = await openEnd(page)
      await fillDate(dialog.getByLabel(/^End on/), await daysFromTownToday(db, -5))
      await dialog.getByRole('button', { name: 'End association' }).click()
      await confirmWith(page, `${endTitle()}?`, 'End association')
      await expectRefusedBeside(
        dialog.getByLabel(/^End on/),
        'The end date cannot be before the date the list is current.',
      )
      expect(await endedOn(db)).toBeNull()
    })

    test('ends the association after the dialog and stores the end date', async ({ page, db }) => {
      await openRoster(page)
      const dialog = await openEnd(page)
      await dialog.getByRole('button', { name: 'End association' }).click()
      await confirmWith(page, `${endTitle()}?`, 'End association')
      await expectConfirmation(page, 'Condo association ended.')
      expect(await endedOn(db)).toBe(await daysFromTownToday(db, 0))
    })

    test('undoes the ending and clears the end date', async ({ page, db }) => {
      await openRoster(page)
      await page.getByRole('button', { name: `Undo ending ${renamed} on ${CONDO_PARCEL}` }).click()
      await expectConfirmation(page, 'The ending was undone.')
      expect(await endedOn(db)).toBeNull()
    })

    function endTitle(): string {
      return `End ${renamed} on ${CONDO_PARCEL}`
    }

    async function openEnd(page: Page) {
      await page.getByRole('button', { name: endTitle() }).click()
      return page.getByRole('dialog', { name: endTitle() })
    }

    async function endedOn(db: E2eDb): Promise<string | null> {
      const row = await db.one<{ ended_on: string | null }>(
        'select ended_on::text from association_rosters where association_name = $1',
        [renamed],
      )
      return row.ended_on
    }
  })
