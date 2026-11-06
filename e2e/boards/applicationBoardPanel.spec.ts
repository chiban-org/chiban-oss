import { expect, test } from '../fixtures/test'
import { confirmWith } from './confirm'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { applicationIdFor, daysFromToday } from './records'
import { expectRefused } from './refusal'

const APPLICATION = 'Osprey Point site plan'

test.describe
  .serial('planning board panel on a submitted application', () => {
    test.use({ role: 'staff' })
    let applicationId: string
    let meeting: MeetingSpec

    test('refuses an acceptance meeting too close to the filing date', async ({
      page,
      db,
      suffix,
    }) => {
      applicationId = await applicationIdFor(db, APPLICATION)
      const soon: MeetingSpec = {
        board: 'planning_board',
        date: await daysFromToday(db, 1),
        kind: 'special',
        location: `Panel too soon room ${suffix}`,
      }
      await addMeetingThroughForm(page, soon)
      await page.goto(`/staff/applications/${applicationId}`)
      const filing = page.getByRole('region', { name: 'Acceptance' })
      await filing.getByLabel(/^Meeting/).selectOption(await meetingIdFor(db, soon))
      await filing.getByRole('button', { name: 'Set the meeting' }).click()
      await expect(filing.getByRole('status')).toContainText(
        'This application was filed too late for that meeting.',
      )
      const row = await db.one<{ meeting_id: string }>(
        'select meeting_id from acceptance_schedules where application_id = $1',
        [applicationId],
      )
      expect(row.meeting_id).not.toBe(await meetingIdFor(db, soon))
    })

    test('sets a later acceptance meeting and stores it', async ({ page, db, suffix }) => {
      meeting = {
        board: 'planning_board',
        date: await daysFromToday(db, 500),
        kind: 'special',
        location: `Panel chain room ${suffix}`,
      }
      await addMeetingThroughForm(page, meeting)
      const meetingId = await meetingIdFor(db, meeting)
      await page.goto(`/staff/applications/${applicationId}`)
      const filing = page.getByRole('region', { name: 'Acceptance' })
      await filing.getByLabel(/^Meeting/).selectOption(meetingId)
      await filing.getByRole('button', { name: 'Set the meeting' }).click()
      await expect(
        filing.getByText('Meeting set. The filing deadline for it is shown on the clocks.'),
      ).toBeVisible()
      const row = await db.one<{ meeting_id: string }>(
        'select meeting_id from acceptance_schedules where application_id = $1',
        [applicationId],
      )
      expect(row.meeting_id).toBe(meetingId)
    })

    test('refuses a regional impact finding with no municipality chosen', async ({ page }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const area = page.getByRole('region', { name: 'Determinations' })
      await area.getByText('Record the regional impact determination', { exact: true }).click()
      await area.getByLabel('Determination').first().selectOption('yes')
      await area.getByRole('button', { name: 'Record determination' }).first().click()
      await expect(area.locator('[id$="-municipalityKeys-error"]')).toHaveText(
        'Choose at least one affected municipality.',
      )
    })

    test('records a no-impact finding and stores it', async ({ page, db }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const area = page.getByRole('region', { name: 'Determinations' })
      await area.getByText('Record the regional impact determination', { exact: true }).click()
      await area.getByLabel('Determination').first().selectOption('no')
      await area.getByRole('button', { name: 'Record determination' }).first().click()
      await expect(area.getByText('Regional impact determination recorded.')).toBeVisible()
      const row = await db.one<{ determination: string }>(
        'select determination from regional_impact_determinations where application_id = $1',
        [applicationId],
      )
      expect(row.determination).toBe('no')
    })

    test('refuses a water body notice that does not apply without a reason', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const area = page.getByRole('region', { name: 'Determinations' })
      await area.getByText('Record the NH DES determination', { exact: true }).click()
      const form = area.locator('form').last()
      await form.getByLabel('Determination').selectOption('not_applicable')
      await form.getByRole('button', { name: 'Record determination' }).click()
      await expectRefused(form.getByLabel(/^Reason/), 'Enter a reason of at least 10 characters.')
      const rows = await db.rows(
        "select 1 from des_proximity_determinations where application_id = $1 and determination = 'not_applicable'",
        [applicationId],
      )
      expect(rows).toHaveLength(0)
    })

    test('records the water body determination the map suggests', async ({ page }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const area = page.getByRole('region', { name: 'Determinations' })
      await area.getByText('Record the NH DES determination', { exact: true }).click()
      const form = area.locator('form').last()
      await form.getByLabel('Determination').selectOption('not_within')
      await form.getByRole('button', { name: 'Record determination' }).click()
      await expect(form.getByText('Determination recorded.')).toBeVisible()
    })

    test('sends the application to the review departments', async ({ page }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const hearings = page.getByRole('region', { name: 'Hearings and decisions' })
      await hearings.getByRole('button', { name: 'Send to review departments' }).click()
      await expect(
        hearings.getByText('Sent to the Technical Review Committee departments.'),
      ).toBeVisible()
    })

    test('refuses ending the application without a reason, then ends it after the confirmation', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const costs = page.getByRole('region', { name: 'Notice costs' })
      await costs.getByText('End this application for unpaid notice costs').click()
      await costs.getByRole('button', { name: 'End the application' }).click()
      await expectRefused(costs.getByLabel(/^Reason/), 'Fill in: Reason.')
      await expect(page.getByRole('dialog', { name: /^End this application/ })).toHaveCount(0)
      await costs.getByLabel(/^Reason/).fill('Notice costs were not paid by the deadline')
      await costs.getByRole('button', { name: 'End the application' }).click()
      await confirmWith(
        page,
        'End this application for unpaid notice costs?',
        'End the application',
      )
      await expect
        .poll(
          async () =>
            (
              await db.one<{ state: string }>('select state from applications where id = $1', [
                applicationId,
              ])
            ).state,
        )
        .not.toBe('submitted')
    })
  })

test.describe('board panel as the inspector', () => {
  test.use({ role: 'inspector' })

  test('offers the regional impact form and none of the clerk forms', async ({ page, db }) => {
    await page.goto(
      `/staff/applications/${await applicationIdFor(db, 'Kingfisher Point site plan')}`,
    )
    await expect(
      page.getByText('Record the regional impact determination', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Set the meeting' })).toHaveCount(0)
    await expect(page.getByText('Record the NH DES determination', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Send to review departments' })).toHaveCount(0)
  })
})
