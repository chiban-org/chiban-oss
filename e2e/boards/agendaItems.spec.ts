import { expect, test } from '../fixtures/test'
import { confirmDialog, confirmWith, permissionAlert } from './confirm'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { daysFromToday } from './records'
import { expectRefused } from './refusal'

async function itemTitles(db: Parameters<typeof meetingIdFor>[0], meetingId: string) {
  const rows = await db.rows<{ title: string }>(
    'select title from agenda_items where meeting_id = $1 order by position',
    [meetingId],
  )
  return rows.map((r) => r.title)
}

test.describe
  .serial('agenda items on a meeting without hearings', () => {
    test.use({ role: 'staff' })
    let spec: MeetingSpec
    let meetingId: string

    test('refuses a first agenda item without a title', async ({ page, db, suffix }) => {
      spec = {
        board: 'planning_board',
        date: await daysFromToday(db, 720),
        kind: 'special',
        location: `Agenda items room ${suffix}`,
      }
      await addMeetingThroughForm(page, spec)
      meetingId = await meetingIdFor(db, spec)
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      await page.getByRole('button', { name: 'Add the first agenda item' }).click()
      await expectRefused(page.getByLabel(/^Title/), 'Fill in: Title.')
      expect(await itemTitles(db, meetingId)).toEqual([])
    })

    test('adds the first agenda item', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      await page.getByLabel(/^Title/).fill('Call to order')
      await page.getByRole('button', { name: 'Add the first agenda item' }).click()
      await expect(
        page.getByRole('region', { name: 'Agenda' }).getByText('Call to order'),
      ).toBeVisible()
      expect(await itemTitles(db, meetingId)).toEqual(['Call to order'])
    })

    test('adds a second item with details', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      await page.getByText('Add an item', { exact: true }).click()
      await page.getByLabel(/^Title/).fill('Public comment')
      await page.getByLabel('Details').fill('Three minutes each')
      await page.getByRole('button', { name: 'Add item' }).click()
      await expect(page.getByText('Three minutes each')).toBeVisible()
      expect(await itemTitles(db, meetingId)).toEqual(['Call to order', 'Public comment'])
    })

    test('moves the first item down', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      const first = page.getByRole('region', { name: 'Agenda' }).getByRole('listitem').first()
      await first.getByRole('button', { name: 'Move down' }).click()
      await expect
        .poll(() => itemTitles(db, meetingId))
        .toEqual(['Public comment', 'Call to order'])
    })

    test('removes an item only after the confirmation', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      const item = page
        .getByRole('region', { name: 'Agenda' })
        .getByRole('listitem')
        .filter({ hasText: 'Public comment' })
      await item.getByRole('button', { name: 'Remove' }).click()
      await expect(confirmDialog(page, 'Remove this item from the agenda?')).toBeVisible()
      expect(await itemTitles(db, meetingId)).toHaveLength(2)
      await confirmWith(page, 'Remove this item from the agenda?', 'Remove the item')
      await expect.poll(() => itemTitles(db, meetingId)).toEqual(['Call to order'])
    })

    test('publishes the agenda and reopens it after the confirmation', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      await page.getByRole('button', { name: 'Publish the agenda' }).click()
      await expect(page.getByText(/^Published on the public site on /)).toBeVisible()
      await page.getByRole('button', { name: 'Reopen the agenda' }).click()
      await confirmWith(page, 'Reopen the published agenda?', 'Reopen the agenda')
      await expect(page.getByRole('button', { name: 'Publish the agenda' })).toBeVisible()
      const agenda = await db.one<{ status: string; revision: number }>(
        'select status, revision from agendas where meeting_id = $1',
        [meetingId],
      )
      expect(agenda).toEqual({ status: 'draft', revision: 1 })
    })
  })

test.describe('meeting page without the capability', () => {
  test.use({ role: 'records' })

  test('offers no agenda forms', async ({ page, db }) => {
    const row = await db.one<{ id: string }>(
      "select id from board_meetings where board = 'planning_board' order by meeting_date limit 1",
    )
    await page.goto(`/staff/boards/meetings/${row.id}`)
    await expect(permissionAlert(page)).toHaveText(
      'You do not have permission to work with meetings.',
    )
  })
})
