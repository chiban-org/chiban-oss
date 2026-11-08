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

    test('every open time is disabled until a request is chosen', async ({ page, db }) => {
      const request = await inspectionOf(db, DECK_NUMBER, 'insulation', 'requested')
      await page.goto('/staff/inspections')
      const slots = page.getByRole('region', { name: 'Open slots' })
      await expect(slots.getByText('Choose a request, then an open time.')).toBeVisible()
      await expect(slots.getByRole('button', { name: /^9:30 AM,/ }).first()).toBeDisabled()
      expect((await inspectionOf(db, DECK_NUMBER, 'insulation')).status).toBe(request.status)
    })

    test('a tapped time opens a review row and books nothing until Book', async ({ page, db }) => {
      const request = await inspectionOf(db, DECK_NUMBER, 'insulation', 'requested')
      const day = longDate(request.preferred_date ?? '')
      await page.goto('/staff/inspections')
      await chooseRequest(page, REQUEST)
      await openSlotsOn(page, day)
        .getByRole('button', { name: /^2:30 PM,/ })
        .click()
      const review = page.getByRole('group', { name: 'Review the booking' })
      await expect(review.getByText(/^Book .* at 2:30 PM with Ira Inspector\.$/)).toBeVisible()
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toHaveCount(0)
      expect((await inspectionOf(db, DECK_NUMBER, 'insulation')).status).toBe('requested')
    })

    test('opens with the request named in the link already chosen', async ({ page, db }) => {
      const request = await inspectionOf(db, DECK_NUMBER, 'insulation', 'requested')
      await page.goto(`/staff/inspections?request=${request.id}`)
      await expect(page.getByText(`Pick a time for ${DECK_NUMBER}, Insulation.`)).toBeVisible()
      await expect(
        page
          .getByRole('region', { name: 'Requests and bookings' })
          .getByRole('button', { name: new RegExp(`Choose ${DECK_NUMBER}, Insulation`) }),
      ).toHaveAttribute('aria-pressed', 'true')
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
