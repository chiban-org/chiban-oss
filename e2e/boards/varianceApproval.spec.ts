import { expect, test } from '../fixtures/test'
import { confirmWith } from './confirm'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { hearingFor, proofCount, proveEveryNotice } from './noticeProof'
import { applicationIdFor, townToday } from './records'
import { uploadPdf } from './upload'

const APPLICATION = 'Marsh Lane lot coverage variance'
const VOTES = [
  'Drew Hale: for',
  'Jules Marsh: for',
  'Toby Fenn: for',
  'Nell Birch: for',
  'Quinn Quill: against',
].join('\n')

test.describe
  .serial('variance approved and finally approved', () => {
    test.use({ role: 'staff' })
    let meeting: MeetingSpec
    let applicationId: string
    let hearingId: string
    let proofTitle: string

    test('schedules a public hearing at a meeting dated today', async ({ page, db, suffix }) => {
      meeting = {
        board: 'zba',
        date: await townToday(db),
        kind: 'special',
        location: `Approval chain room ${suffix}`,
      }
      proofTitle = `Receipt ${suffix}`
      await addMeetingThroughForm(page, meeting)
      applicationId = await applicationIdFor(db, APPLICATION)
      await page.goto(`/staff/applications/${applicationId}`)
      const panel = page.getByRole('region', { name: 'Hearings and decisions' })
      await panel.getByText('Schedule a hearing', { exact: true }).click()
      await panel.getByLabel('Meeting').selectOption(await meetingIdFor(db, meeting))
      await panel.getByLabel('Kind').selectOption('public_hearing')
      await panel.getByRole('button', { name: 'Schedule hearing' }).click()
      await expect(
        panel.getByText('Hearing scheduled. The notice checklist is ready.'),
      ).toBeVisible()
      const row = await db.one<{ id: string }>(
        'select id from hearings where application_id = $1 and meeting_id = $2',
        [applicationId, await meetingIdFor(db, meeting)],
      )
      hearingId = row.id
    })

    test('proves every notice, marks the hearing noticed and held', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.locator('summary', { hasText: 'Record proof of notice' }).click()
      await uploadPdf(page.locator('#record-proof'), 'Upload a certificate or receipt', proofTitle)
      await proveEveryNotice(page, proofTitle)
      expect(await proofCount(db, hearingId)).toBe(12)
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.getByRole('button', { name: 'Mark properly noticed' }).click()
      await page.getByRole('button', { name: 'Mark the hearing held' }).click()
      await expect
        .poll(
          async () =>
            (
              await db.one<{ status: string }>('select status from hearings where id = $1', [
                hearingId,
              ])
            ).status,
        )
        .toBe('held')
    })

    test('records an approval and moves the application to decided', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      const section = page.getByRole('region', { name: 'Record the decision' })
      await section.getByLabel('Motion').fill('Grant the lot coverage variance')
      await section.getByLabel('How each member voted').fill(VOTES)
      await section.getByLabel('Findings of fact').fill('The five variance criteria are met.')
      await section.getByRole('button', { name: 'Record decision' }).click()
      await confirmWith(page, "Record the board's decision?", 'Record decision')
      await expect
        .poll(
          async () =>
            (
              await db.one<{ state: string }>('select state from applications where id = $1', [
                applicationId,
              ])
            ).state,
        )
        .toBe('decided')
    })

    test('records the date of final approval and starts the exercise deadline', async ({
      page,
    }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const follow = page.getByRole('region', { name: 'Decision follow-up' })
      await follow.getByRole('button', { name: 'Record final approval' }).click()
      await expect(follow.getByText(/^The approval must be exercised by /)).toBeVisible()
    })
  })
