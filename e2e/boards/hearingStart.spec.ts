import { type E2eDb, expect, test } from '../fixtures/test'
import { expectToast } from '../records/requestSupport'
import { drawAndIssueList } from './abutterList'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { applicationIdFor, daysFromToday, townToday } from './records'
import { expectRefused } from './refusal'

const APPLICATION = 'Pintail Way setback variance'

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

    test('issues the abutter list the hearing depends on', async ({ page, db }) => {
      await drawAndIssueList(page, db, applicationId)
    })

    test('refuses scheduling the hearing before a meeting is chosen', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearing = page.getByRole('region', { name: 'Do this now' })
      await expect(hearing).toContainText('Schedule the hearing')
      await hearing.getByRole('button', { name: 'Schedule the hearing' }).click()
      await expectRefused(hearing.getByLabel('Hearing meeting'), 'Fill in: Hearing meeting.')
      const rows = await db.rows('select 1 from hearings where application_id = $1', [
        applicationId,
      ])
      expect(rows).toHaveLength(0)
    })

    test('schedules the public hearing at the later meeting in one step', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearing = page.getByRole('region', { name: 'Do this now' })
      await hearing.getByLabel('Hearing meeting').selectOption(await meetingIdFor(db, later))
      await hearing.getByRole('button', { name: 'Schedule the hearing' }).click()
      await expectToast(page, 'Hearing scheduled. The notice checklist is ready.')
      const stored = await db.one<{ status: string; kind: string }>(
        'select status, kind from hearings where id = $1',
        [await hearingIdAt(db, applicationId, later)],
      )
      expect(stored).toEqual({ status: 'scheduled', kind: 'public_hearing' })
      const state = await db.one<{ state: string }>(
        'select state from applications where id = $1',
        [applicationId],
      )
      expect(state.state).toBe('under_review')
      const votes = await db.rows('select 1 from completeness_votes where application_id = $1', [
        applicationId,
      ])
      expect(votes).toHaveLength(0)
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
    await expect(page.getByRole('button', { name: 'Schedule the hearing' })).toHaveCount(0)
  })
})
