import { expect, test } from '../fixtures/test'
import { confirmWith, permissionAlert } from './confirm'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { expectRefused } from './refusal'

test.describe
  .serial('meeting calendar', () => {
    test.use({ role: 'staff' })
    let spec: MeetingSpec

    test.beforeAll(() => {
      spec = {
        board: 'zba',
        date: '2031-03-04',
        kind: 'special',
        location: 'Calendar test room',
      }
    })

    test('schedules a meeting and stores it with the chosen board, date, kind and location', async ({
      page,
      db,
    }) => {
      await addMeetingThroughForm(page, spec)
      const row = await db.one<{ status: string }>(
        'select status from board_meetings where board = $1 and meeting_date = $2 and kind = $3 and location = $4',
        [spec.board, spec.date, spec.kind, spec.location],
      )
      expect(row.status).toBe('scheduled')
    })

    test('refuses a meeting without a date and stores nothing', async ({ page, db }) => {
      const before = await db.one<{ count: string }>(
        'select count(*) from board_meetings where location = $1',
        ['Calendar refusal room'],
      )
      await page.goto('/staff/boards/meetings')
      await page.getByRole('button', { name: 'Add meeting' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a meeting' })
      await dialog.getByLabel('Location').fill('Calendar refusal room')
      await dialog.getByRole('button', { name: 'Add meeting' }).click()
      await expectRefused(dialog.getByLabel('Date'), 'Fill in: Date.')
      const after = await db.one<{ count: string }>(
        'select count(*) from board_meetings where location = $1',
        ['Calendar refusal room'],
      )
      expect(after.count).toBe(before.count)
    })

    test('refuses a second meeting on the same board, date and kind beside the date field', async ({
      page,
    }) => {
      await page.goto('/staff/boards/meetings')
      await page.getByRole('button', { name: 'Add meeting' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a meeting' })
      await dialog.getByLabel('Board').selectOption(spec.board)
      await dialog.getByLabel('Date').fill(spec.date)
      await dialog.getByLabel('Kind').selectOption(spec.kind)
      await dialog.getByRole('button', { name: 'Add meeting' }).click()
      await expect(dialog.getByRole('status')).not.toHaveText('')
      await expect(dialog.getByLabel('Date')).toHaveAttribute('aria-invalid', 'true')
    })

    test('cancel asks for a reason before it opens the confirmation', async ({ page, db }) => {
      await page.goto('/staff/boards/meetings?board=zba&kind=special')
      const row = page.getByRole('row').filter({ hasText: spec.location })
      await row.getByText('Cancel', { exact: true }).click()
      await row.getByRole('button', { name: 'Cancel meeting' }).click()
      await expectRefused(row.getByLabel('Reason'), 'Fill in: Reason.')
      await expect(page.getByRole('dialog', { name: /^Cancel the/ })).toHaveCount(0)
      const stored = await db.one<{ status: string }>(
        'select status from board_meetings where id = $1',
        [await meetingIdFor(db, spec)],
      )
      expect(stored.status).toBe('scheduled')
    })

    test('cancels the meeting after the confirmation and stores the reason', async ({
      page,
      db,
    }) => {
      await page.goto('/staff/boards/meetings?board=zba&kind=special')
      const row = page.getByRole('row').filter({ hasText: spec.location })
      await row.getByText('Cancel', { exact: true }).click()
      await row.getByLabel('Reason').fill('Hearing moved to the next quarter')
      await row.getByRole('button', { name: 'Cancel meeting' }).click()
      await confirmWith(page, /^Cancel the .* meeting\?$/, 'Cancel the meeting')
      await expect(row.getByText('Cancelled', { exact: true })).toBeVisible()
      const stored = await db.one<{ status: string; cancel_reason: string }>(
        'select status, cancel_reason from board_meetings where id = $1',
        [await meetingIdFor(db, spec)],
      )
      expect(stored).toEqual({
        status: 'cancelled',
        cancel_reason: 'Hearing moved to the next quarter',
      })
    })
  })

test.describe('meeting calendar without the capability', () => {
  test.use({ role: 'inspector' })

  test('has no add or cancel form and says so', async ({ page }) => {
    await page.goto('/staff/boards/meetings')
    await expect(permissionAlert(page)).toHaveText(
      'You do not have permission to keep the meeting calendar.',
    )
    await expect(page.getByRole('button', { name: 'Add meeting' })).toHaveCount(0)
  })
})
