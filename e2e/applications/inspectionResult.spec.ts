import { expect, test } from '../fixtures/test'
import { inspectionOf, passEveryItem } from './inspectionSupport'
import { doThisNow, expectConfirmation } from './support'

const DECK_NUMBER = 'BP-2025-0001'

test.describe('recording an inspection result', () => {
  test.describe('as the finance clerk', () => {
    test.use({ role: 'finance' })

    test('reads a scheduled inspection without the checklist form', async ({ page, db }) => {
      const booked = await inspectionOf(db, DECK_NUMBER, 'framing', 'scheduled')
      await page.goto(`/staff/inspections/${booked.id}`)
      await expect(page.getByRole('heading', { name: 'Framing reinspection' })).toBeVisible()
      await expect(doThisNow(page)).toContainText('Waiting on Ira Inspector')
      await expect(page.getByRole('region', { name: 'Checklist' })).toContainText(
        'Structural framing',
      )
      await expect(page.getByRole('button', { name: 'Record result' })).toHaveCount(0)
      await expect(page.getByRole('radiogroup')).toHaveCount(0)
    })
  })

  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('waits on the assigned inspector instead of recording', async ({ page, db }) => {
      const booked = await inspectionOf(db, DECK_NUMBER, 'framing', 'scheduled')
      await page.goto(`/staff/inspections/${booked.id}`)
      await expect(doThisNow(page)).toContainText('Waiting on Ira Inspector')
      await expect(page.getByRole('radiogroup')).toHaveCount(0)
      await expect(page.getByText('Add a photo')).toHaveCount(0)
    })
  })

  test.describe('as the inspector', () => {
    test.use({ role: 'inspector' })

    test('a failed item without notes keeps the button disabled and stores nothing', async ({
      page,
      db,
    }) => {
      const booked = await inspectionOf(db, DECK_NUMBER, 'framing', 'scheduled')
      await page.goto(`/staff/inspections/${booked.id}`)
      await page.getByRole('radiogroup').first().getByRole('radio', { name: 'Fail' }).click()

      await expect(page.getByText('Write at least 10 characters about what failed.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Record result' })).toBeDisabled()
      expect((await inspectionOf(db, DECK_NUMBER, 'framing', 'scheduled')).id).toBe(booked.id)
    })

    test('asks first, then passes the framing reinspection and stores the result', async ({
      page,
      db,
    }) => {
      const booked = await inspectionOf(db, DECK_NUMBER, 'framing', 'scheduled')
      await page.goto(`/staff/inspections/${booked.id}`)
      await expect(page.getByRole('button', { name: 'Record result' })).toBeDisabled()
      await passEveryItem(page)
      await page
        .getByLabel('Notes for the permit holder')
        .fill('Framing corrected and fire blocking in place.')
      await expect(page.getByText('Result: Passed')).toBeVisible()
      await page.getByRole('button', { name: 'Record result' }).click()

      const dialog = page.getByRole('dialog', {
        name: 'Record the Framing reinspection as passed?',
      })
      await expect(dialog).toContainText('A result cannot be changed once it is recorded.')
      await dialog.getByRole('button', { name: 'Keep editing' }).click()
      await expect(dialog).toHaveCount(0)
      expect((await inspectionOf(db, DECK_NUMBER, 'framing', 'scheduled')).id).toBe(booked.id)

      await page.getByRole('button', { name: 'Record result' }).click()
      await dialog.getByRole('button', { name: 'Record as passed' }).click()

      await expectConfirmation(page, 'Result recorded.')
      const result = page.getByRole('region', { name: 'Result' })
      await expect(result).toContainText('Structural framing: Pass')
      await expect(result).toContainText('Notes: Framing corrected and fire blocking in place.')
      const row = await db.one<{ status: string; result_notes: string }>(
        'select status, result_notes from inspections where id = $1',
        [booked.id],
      )
      expect(row).toEqual({
        status: 'passed',
        result_notes: 'Framing corrected and fire blocking in place.',
      })
    })
  })
})
