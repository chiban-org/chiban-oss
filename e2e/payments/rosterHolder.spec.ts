import type { Locator } from '@playwright/test'
import { expect, fillDate, test } from '../fixtures/test'
import {
  daysFromTownToday,
  openDialog,
  openMore,
  openRoster,
  pickParcel,
  rosterRow,
} from './rosterSupport'
import { confirmWith, expectConfirmation, expectRefusedBeside } from './support'

const HOLDER_PARCEL = '009016000000'

test.describe
  .serial('restriction holders on the notice roster', () => {
    test.use({ role: 'staff' })
    let holder = ''

    async function fillHolder(dialog: Locator, reference: string) {
      await dialog.getByLabel(/^Holder name/).fill(holder)
      await dialog.getByLabel(/^Holder mailing address/).fill('6 Trust Lane, Alder Pond NH 03999')
      await dialog.getByLabel(/^Where it is recorded/).fill(reference)
    }

    test('refuses a recorded reference of only spaces beside the field', async ({
      page,
      db,
      suffix,
    }) => {
      holder = `Brook Land Trust ${suffix}`
      await openRoster(page, { kind: 'holders' })
      const dialog = await openDialog(page, 'Add holder', 'Add a restriction holder')
      await pickParcel(dialog, '009016', new RegExp(`^${HOLDER_PARCEL}`))
      await fillHolder(dialog, '   ')
      await dialog.getByRole('button', { name: 'Add holder' }).click()
      await expectRefusedBeside(
        dialog.getByLabel(/^Where it is recorded/),
        'Enter where it is recorded.',
      )
      const rows = await db.rows('select 1 from restriction_holdings where holder_name = $1', [
        holder,
      ])
      expect(rows).toEqual([])
    })

    test('adds a holder and stores the kind and recorded reference', async ({ page, db }) => {
      await openRoster(page, { kind: 'holders' })
      const dialog = await openDialog(page, 'Add holder', 'Add a restriction holder')
      await pickParcel(dialog, '009016', new RegExp(`^${HOLDER_PARCEL}`))
      await fillHolder(dialog, 'Book 500, Page 12')
      await dialog.getByRole('button', { name: 'Add holder' }).click()
      await expectConfirmation(page, 'Restriction holder added.')
      const row = await db.one<{ recorded_reference: string }>(
        'select recorded_reference from restriction_holdings where holder_name = $1',
        [holder],
      )
      expect(row.recorded_reference).toBe('Book 500, Page 12')
    })

    test('updates the recorded reference and stores it', async ({ page, db }) => {
      await openRoster(page, { kind: 'holders', q: holder })
      await rosterRow(page, holder)
        .getByRole('button', { name: `Edit ${holder} on ${HOLDER_PARCEL}` })
        .click()
      const dialog = page.getByRole('dialog', { name: `Edit ${holder}` })
      await dialog.getByLabel(/^Where it is recorded/).fill('Book 500, Page 13')
      await dialog.getByRole('button', { name: 'Save changes' }).click()
      await expectConfirmation(page, 'Restriction holder saved.')
      const row = await db.one<{ recorded_reference: string }>(
        'select recorded_reference from restriction_holdings where holder_name = $1',
        [holder],
      )
      expect(row.recorded_reference).toBe('Book 500, Page 13')
    })

    test('refuses an end date in the future, then ends and undoes the ending', async ({
      page,
      db,
    }) => {
      await openRoster(page, { kind: 'holders', q: holder })
      const title = `End ${holder} on ${HOLDER_PARCEL}`
      await openMore(page, `${holder} on ${HOLDER_PARCEL}`)
      await page.getByRole('button', { name: title }).click()
      const dialog = page.getByRole('dialog', { name: title })
      await fillDate(dialog.getByLabel(/^End on/), await daysFromTownToday(db, 30))
      await dialog.getByRole('button', { name: 'End restriction' }).click()
      await expectRefusedBeside(
        dialog.getByLabel(/^End on/),
        'Enter the end date between January 1, 1900 and',
      )
      await fillDate(dialog.getByLabel(/^End on/), await daysFromTownToday(db, 0))
      await dialog.getByRole('button', { name: 'End restriction' }).click()
      await confirmWith(page, `${title}?`, 'End restriction')
      await expectConfirmation(page, 'Restriction ended.')
      await openRoster(page, { kind: 'holders', q: holder, status: 'ended' })
      await openMore(page, `${holder} on ${HOLDER_PARCEL}`)
      await page.getByRole('button', { name: `Undo ending ${holder} on ${HOLDER_PARCEL}` }).click()
      await expectConfirmation(page, 'The ending was undone.')
      const row = await db.one<{ ended_on: string | null }>(
        'select ended_on::text from restriction_holdings where holder_name = $1',
        [holder],
      )
      expect(row.ended_on).toBeNull()
    })

    test('records a land records check dated today', async ({ page, db }) => {
      await openRoster(page, { kind: 'holders' })
      await page.getByRole('button', { name: 'Record a check' }).click()
      await expectConfirmation(page, 'Land records check recorded.')
      await expect(page.getByText(/^Land records checked for new restrictions on/)).toBeVisible()
      expect(await daysFromTownToday(db, 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
