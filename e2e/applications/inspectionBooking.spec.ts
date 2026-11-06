import { expect, test } from '../fixtures/test'
import { bookSlot, chooseRequest, inspectionOf, openSlotsOn } from './inspectionSupport'

const DECK_NUMBER = 'BP-2025-0001'
const REQUEST = `${DECK_NUMBER}, Insulation`

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

test.describe('booking a requested inspection into an open time', () => {
  test.describe('as the clerk', () => {
    test.use({ role: 'staff' })

    test('an open time does nothing until a request is chosen', async ({ page, db }) => {
      const request = await inspectionOf(db, DECK_NUMBER, 'insulation', 'requested')
      await page.goto('/staff/inspections')
      await expect(
        page
          .getByRole('region', { name: 'Open slots' })
          .getByText('Choose a request, then an open time.'),
      ).toBeVisible()
      await page
        .getByRole('region', { name: 'Open slots' })
        .getByRole('button', { name: '9:30 AM' })
        .first()
        .click()

      await expect(
        page.getByRole('region', { name: 'Open slots' }).getByRole('status'),
      ).toHaveCount(0)
      expect((await inspectionOf(db, DECK_NUMBER, 'insulation')).status).toBe(request.status)
    })

    test('books the insulation request on its preferred day and stores the time', async ({
      page,
      db,
    }) => {
      const request = await inspectionOf(db, DECK_NUMBER, 'insulation', 'requested')
      expect(request.preferred_date).not.toBeNull()
      const day = longDate(request.preferred_date ?? '')
      await page.goto('/staff/inspections')
      await chooseRequest(page, REQUEST)
      await expect(page.getByText(`Pick a time for ${DECK_NUMBER}, Insulation.`)).toBeVisible()
      await bookSlot(page, day, '2:30 PM')

      const booked = await inspectionOf(db, DECK_NUMBER, 'insulation')
      expect(booked).toMatchObject({
        status: 'scheduled',
        scheduled_date: request.preferred_date,
        start_minute: 14 * 60 + 30,
      })
      await expect(openSlotsOn(page, day).getByRole('button', { name: /^2:30 PM,/ })).toHaveCount(0)
    })
  })

  test.describe('as the finance clerk', () => {
    test.use({ role: 'finance' })

    test('sees no open times to book', async ({ page }) => {
      await page.goto('/staff/inspections')
      await expect(page.getByRole('region', { name: 'Open slots' })).toHaveCount(0)
    })
  })
})
