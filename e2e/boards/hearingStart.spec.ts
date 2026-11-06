import { type E2eDb, expect, test } from '../fixtures/test'
import { expectToast } from '../records/requestSupport'
import { drawAndIssueList } from './abutterList'
import { confirmWith } from './confirm'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { applicationIdFor, daysFromToday, townToday } from './records'
import { expectRefused } from './refusal'

const APPLICATION = 'Pintail Way setback variance'
const SET_MEETING_COPY = 'Meeting set. The filing deadline for it is shown on the clocks.'

async function hearingIdAt(db: E2eDb, applicationId: string, spec: MeetingSpec): Promise<string> {
  const row = await db.one<{ id: string }>(
    'select id from hearings where application_id = $1 and meeting_id = $2',
    [applicationId, await meetingIdFor(db, spec)],
  )
  return row.id
}

async function zbaMeeting(db: E2eDb, daysAhead: number, place: string): Promise<MeetingSpec> {
  return {
    board: 'zba',
    date: daysAhead === 0 ? await townToday(db) : await daysFromToday(db, daysAhead),
    kind: 'special',
    location: `Start chain room, ${place}`,
  }
}

test.describe
  .serial('variance filing to scheduled hearing', () => {
    test.use({ role: 'staff' })
    let today: MeetingSpec
    let later: MeetingSpec
    let third: MeetingSpec
    let applicationId: string

    test('adds the meeting dated today and two later ones', async ({ page, db }) => {
      today = await zbaMeeting(db, 0, 'today')
      later = await zbaMeeting(db, 400, 'later')
      third = await zbaMeeting(db, 430, 'third')
      for (const spec of [today, later, third]) await addMeetingThroughForm(page, spec)
      applicationId = await applicationIdFor(db, APPLICATION)
    })

    test('issues the abutter list the vote depends on', async ({ page, db }) => {
      await drawAndIssueList(page, db, applicationId)
    })

    test('refuses setting the hearing meeting before one is chosen', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearing = page.getByRole('region', { name: 'Hearing', exact: true })
      await hearing.getByRole('button', { name: 'Set the meeting' }).click()
      await expectRefused(hearing.getByLabel('Hearing meeting'), 'Fill in: Hearing meeting.')
      const rows = await db.rows('select 1 from acceptance_schedules where application_id = $1', [
        applicationId,
      ])
      expect(rows).toHaveLength(0)
    })

    test('sets the hearing meeting and stores the schedule', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearing = page.getByRole('region', { name: 'Hearing', exact: true })
      const meetingId = await meetingIdFor(db, today)
      await hearing.getByLabel('Hearing meeting').selectOption(meetingId)
      await hearing.getByRole('button', { name: 'Set the meeting' }).click()
      await expect(hearing.getByText(SET_MEETING_COPY)).toBeVisible()
      const row = await db.one<{ meeting_id: string }>(
        'select meeting_id from acceptance_schedules where application_id = $1',
        [applicationId],
      )
      expect(row.meeting_id).toBe(meetingId)
    })

    test('refuses a vote dated after today and records nothing', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearing = page.getByRole('region', { name: 'Hearing', exact: true })
      await hearing.getByText('Open the hearing', { exact: true }).click()
      await hearing.getByLabel('Date of the vote').fill(await daysFromToday(db, 3))
      await hearing.getByRole('button', { name: 'Record vote' }).click()
      await expectRefused(hearing.getByLabel('Date of the vote'), 'Check: Date of the vote.')
      await expect(page.getByRole('dialog', { name: 'Record this vote?' })).toHaveCount(0)
      const votes = await db.rows('select 1 from completeness_votes where application_id = $1', [
        applicationId,
      ])
      expect(votes).toHaveLength(0)
    })

    test('records an accepted vote after the confirmation', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearing = page.getByRole('region', { name: 'Hearing', exact: true })
      await hearing.getByText('Open the hearing', { exact: true }).click()
      await hearing.getByRole('button', { name: 'Record vote' }).click()
      await confirmWith(page, 'Record this vote?', 'Record vote')
      await expect
        .poll(
          async () =>
            (
              await db.rows('select 1 from completeness_votes where application_id = $1', [
                applicationId,
              ])
            ).length,
        )
        .toBe(1)
      const vote = await db.one<{ outcome: string; voted_on: string }>(
        'select outcome, voted_on::text from completeness_votes where application_id = $1',
        [applicationId],
      )
      expect(vote).toEqual({ outcome: 'accepted', voted_on: today.date })
      const state = await db.one<{ state: string }>(
        'select state from applications where id = $1',
        [applicationId],
      )
      expect(state.state).toBe('under_review')
    })

    test('schedules a public hearing at the later meeting and stores it', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const panel = page.getByRole('region', { name: 'Hearings and decisions' })
      await panel.getByText('Schedule a hearing', { exact: true }).click()
      await panel.getByLabel('Meeting').selectOption(await meetingIdFor(db, later))
      await panel.getByLabel('Kind').selectOption('public_hearing')
      await panel.getByRole('button', { name: 'Schedule hearing' }).click()
      await expectToast(page, 'Hearing scheduled. The notice checklist is ready.')
      const hearing = await db.one<{ status: string; kind: string }>(
        'select status, kind from hearings where id = $1',
        [await hearingIdAt(db, applicationId, later)],
      )
      expect(hearing).toEqual({ status: 'scheduled', kind: 'public_hearing' })
    })

    test('refuses a continuation announced without saying what was announced', async ({
      page,
      db,
    }) => {
      const hearingId = await hearingIdAt(db, applicationId, later)
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.getByText('Continue to another meeting', { exact: true }).click()
      await page.getByLabel('New meeting').selectOption(await meetingIdFor(db, third))
      await page.getByRole('button', { name: 'Continue hearing' }).click()
      await expectRefused(
        page.getByLabel('What was announced'),
        'Enter the date, time, and place that were announced at the meeting.',
      )
      const stored = await db.one<{ status: string }>('select status from hearings where id = $1', [
        hearingId,
      ])
      expect(stored.status).toBe('scheduled')
    })

    test('continues the hearing and links the new hearing back to it', async ({ page, db }) => {
      const hearingId = await hearingIdAt(db, applicationId, later)
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.getByText('Continue to another meeting', { exact: true }).click()
      await page.getByLabel('New meeting').selectOption(await meetingIdFor(db, third))
      await page.getByLabel('What was announced', { exact: true }).fill('Thursday session at 7 pm')
      await page.getByRole('button', { name: 'Continue hearing' }).click()
      await expect(page.getByText('Later hearing', { exact: true })).toBeVisible()
      const next = await db.one<{ continued_from: string; status: string }>(
        'select continued_from, status from hearings where id = $1',
        [await hearingIdAt(db, applicationId, third)],
      )
      expect(next).toEqual({ continued_from: hearingId, status: 'scheduled' })
    })
  })

test.describe('hearing forms without the capability', () => {
  test.use({ role: 'inspector' })

  test('shows no schedule or set-meeting form on the application', async ({ page, db }) => {
    const id = await applicationIdFor(db, 'Brookside setback variance')
    await page.goto(`/staff/applications/${id}`)
    await expect(page.getByRole('region', { name: 'Board' })).toBeVisible()
    await expect(page.getByText('Schedule a hearing', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Set the meeting' })).toHaveCount(0)
  })
})
