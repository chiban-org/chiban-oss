import { expect, test } from '../fixtures/test'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { daysFromToday } from './records'
import { expectRefused } from './refusal'
import { uploadPdf } from './upload'

test.describe
  .serial('minutes of a meeting that has been held', () => {
    test.use({ role: 'staff' })
    let spec: MeetingSpec
    let meetingId: string
    let minutesTitle: string

    test('refuses recording minutes before any file is chosen', async ({ page, db, suffix }) => {
      spec = {
        board: 'planning_board',
        date: await daysFromToday(db, -1),
        kind: 'special',
        location: `Minutes room ${suffix}`,
      }
      minutesTitle = `Minutes ${suffix}`
      await addMeetingThroughForm(page, spec)
      meetingId = await meetingIdFor(db, spec)
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      await uploadPdf(
        page.getByRole('region', { name: 'Minutes' }),
        'Upload the minutes',
        minutesTitle,
      )
      await page.getByRole('button', { name: 'Record the minutes' }).click()
      await expectRefused(page.locator('select[name="documentId"]'), 'Fill in: Minutes.')
      const rows = await db.rows('select 1 from meeting_minutes where meeting_id = $1', [meetingId])
      expect(rows).toHaveLength(0)
    })

    test('records the uploaded file as draft minutes', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      const section = page.getByRole('region', { name: 'Minutes' })
      await section.locator('select[name="documentId"]').selectOption({ label: minutesTitle })
      await section.getByRole('button', { name: 'Record the minutes' }).click()
      await expect
        .poll(async () => {
          const rows = await db.rows<{ status: string }>(
            'select status from meeting_minutes where meeting_id = $1',
            [meetingId],
          )
          return rows[0]?.status ?? ''
        })
        .toBe('draft')
    })

    test('refuses approved minutes without an approval date beside that field', async ({
      page,
    }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      const section = page.getByRole('region', { name: 'Minutes' })
      await section.getByLabel('Status').selectOption('approved')
      await section.getByRole('button', { name: 'Record the minutes' }).click()
      await expect(section.getByLabel('Date approved')).toHaveAttribute('aria-invalid', 'true')
    })

    test('records the minutes as approved on the meeting date', async ({ page, db }) => {
      await page.goto(`/staff/boards/meetings/${meetingId}`)
      const section = page.getByRole('region', { name: 'Minutes' })
      await section.getByLabel('Status').selectOption('approved')
      await section.getByLabel('Date approved').fill(spec.date)
      await section.getByRole('button', { name: 'Record the minutes' }).click()
      await expect
        .poll(async () => {
          const rows = await db.rows<{ status: string; approved_on: string }>(
            'select status, approved_on::text from meeting_minutes where meeting_id = $1',
            [meetingId],
          )
          return `${rows[0]?.status} ${rows[0]?.approved_on}`
        })
        .toBe(`approved ${spec.date}`)
    })
  })
