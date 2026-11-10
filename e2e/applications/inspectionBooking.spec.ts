import { expect, test } from '../fixtures/test'
import {
  bookSlot,
  chooseRequest,
  inspectionOf,
  openTimesOn,
  scheduleRegion,
  timeOn,
} from './inspectionSupport'
import { demoTitle, seededNumber } from './support'

const DECK = demoTitle('Deck renewed once')
let deckNumber = ''

test.beforeAll(async ({ db }) => {
  deckNumber = await seededNumber(db, DECK)
})
const deckRequest = () => `${deckNumber}, Insulation`

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
      const request = await inspectionOf(db, deckNumber, 'insulation', 'requested')
      await page.goto('/staff/inspections')
      const slots = scheduleRegion(page)
      await expect(slots.getByText('Choose a request, then an open time.')).toBeVisible()
      await expect(slots.getByRole('button', { name: /^\+?\d+ open, / }).first()).toBeDisabled()
      expect((await inspectionOf(db, deckNumber, 'insulation')).status).toBe(request.status)
    })

    test('a tapped time opens a review row and books nothing until Book', async ({ page, db }) => {
      const request = await inspectionOf(db, deckNumber, 'insulation', 'requested')
      const day = longDate(request.preferred_date ?? '')
      await page.goto('/staff/inspections')
      await chooseRequest(page, deckRequest())
      await openTimesOn(page, day)
      await timeOn(page, day, '2:30 PM').click()
      const review = page.getByRole('group', { name: 'Review the booking' })
      await expect(review.getByText(/^Book .* at 2:30 PM with Ira Inspector\.$/)).toBeVisible()
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toHaveCount(0)
      expect((await inspectionOf(db, deckNumber, 'insulation')).status).toBe('requested')
    })

    test('opens with the request named in the link already chosen', async ({ page, db }) => {
      const request = await inspectionOf(db, deckNumber, 'insulation', 'requested')
      await page.goto(`/staff/inspections?request=${request.id}`)
      await expect(page.getByText(`Pick a time for ${deckNumber}, Insulation.`)).toBeVisible()
      await expect(
        page
          .getByRole('region', { name: 'Waiting' })
          .getByRole('button', { name: new RegExp(`Choose ${deckNumber}, Insulation`) }),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    test('books the insulation request on its preferred day and stores the time', async ({
      page,
      db,
    }) => {
      const request = await inspectionOf(db, deckNumber, 'insulation', 'requested')
      expect(request.preferred_date).not.toBeNull()
      const day = longDate(request.preferred_date ?? '')
      await page.goto('/staff/inspections')
      await chooseRequest(page, deckRequest())
      await expect(page.getByText(`Pick a time for ${deckNumber}, Insulation.`)).toBeVisible()
      await bookSlot(page, day, '2:30 PM')

      const booked = await inspectionOf(db, deckNumber, 'insulation')
      expect(booked).toMatchObject({
        status: 'scheduled',
        scheduled_date: request.preferred_date,
        start_minute: 14 * 60 + 30,
      })
      await expect(
        scheduleRegion(page).getByRole('button', {
          name: new RegExp(`^Move 2:30 PM ${deckNumber} Insulation$`),
        }),
      ).toBeVisible()
      await expect(page.getByRole('region', { name: 'Waiting' })).not.toContainText(deckRequest())
    })
  })

  test.describe('as the finance clerk', () => {
    test.use({ role: 'finance' })

    test('sees no open times to book', async ({ page }) => {
      await page.goto('/staff/inspections')
      await expect(page.getByRole('region', { name: 'Schedule' })).toHaveCount(0)
    })
  })
})
