import { type E2eDb, expect, test } from '../fixtures/test'
import { confirmWith, permissionAlert } from './confirm'
import { expectFormStatus } from './confirmation'
import { addMeetingThroughForm, type MeetingSpec, meetingIdFor } from './meetings'
import { CERTIFIED, fillProof, hearingFor, OTHER_GROUPS, proofCount, VOTES } from './noticeProof'
import { applicationIdFor, townToday } from './records'
import { expectRefused } from './refusal'
import { uploadPdf } from './upload'

const APPLICATION = 'Brookview minor site plan'
test.describe
  .serial('hearing notice proof and noticing', () => {
    test.use({ role: 'staff' })
    let meeting: MeetingSpec
    let applicationId: string
    let hearingId: string
    let proofTitle: string

    test('schedules a public hearing at a meeting dated today', async ({ page, db, suffix }) => {
      meeting = {
        board: 'planning_board',
        date: await townToday(db),
        kind: 'special',
        location: `Notice chain room ${suffix}`,
      }
      proofTitle = `Mailing receipt ${suffix}`
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
      hearingId = await hearingFor(db, applicationId)
    })

    test('refuses proof with no uploaded file chosen and stores nothing', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.locator('summary', { hasText: 'Record proof of notice' }).click()
      await page.getByRole('button', { name: 'Record proof' }).click()
      await expectRefused(
        page.locator('#record-proof').getByLabel(/^Certificate or receipt/),
        'Fill in:',
      )
      expect(await proofCount(db, hearingId)).toBe(0)
    })

    test('uploads a receipt to storage and lists it under the application', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.locator('summary', { hasText: 'Record proof of notice' }).click()
      await uploadPdf(page.locator('#record-proof'), 'Upload a certificate or receipt', proofTitle)
      const doc = await db.one<{ title: string }>(
        'select title from documents where record_id = $1 and title = $2',
        [applicationId, proofTitle],
      )
      expect(doc.title).toBe(proofTitle)
    })

    test('refuses certified mail proof without a tracking number beside that field', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await fillProof(page, proofTitle, { method: 'Certified mail receipt', items: CERTIFIED })
      await expect(page.locator('#record-proof').getByLabel('Tracking number')).toHaveAttribute(
        'aria-invalid',
        'true',
      )
      expect(await proofCount(db, hearingId)).toBe(0)
    })

    test('records certified mail proof for the three certified notices', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await fillProof(page, proofTitle, {
        method: 'Certified mail receipt',
        items: CERTIFIED,
        reference: 'RR 1001',
      })
      await expectFormStatus(page, 'Proof recorded.')
      await expect.poll(() => proofCount(db, hearingId)).toBe(3)
    })

    test('records proof for the remaining notices by method', async ({ page, db }) => {
      for (const group of OTHER_GROUPS) {
        await page.goto(`/staff/boards/hearings/${hearingId}`)
        await fillProof(page, proofTitle, group)
        await expectFormStatus(page, 'Proof recorded.')
      }
      await expect.poll(() => proofCount(db, hearingId)).toBe(8)
    })

    test('marks the hearing properly noticed', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      await page.getByRole('button', { name: 'Mark properly noticed' }).click()
      await expect
        .poll(async () => {
          const row = await db.one<{ noticed: boolean }>(
            'select properly_noticed_at is not null as noticed from hearings where id = $1',
            [hearingId],
          )
          return row.noticed
        })
        .toBe(true)
    })

    test('marks the hearing held on the meeting date', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
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
      const row = await db.one<{ held_on: string }>(
        'select held_on::text from hearings where id = $1',
        [hearingId],
      )
      expect(row.held_on).toBe(meeting.date)
    })

    test('records a new request to the selectmen that is still waiting', async ({ page }) => {
      await page.goto(`/staff/applications/${applicationId}`)
      const follow = page.getByRole('region', { name: 'Decision follow-up' })
      await follow.getByText('Record a request to the selectmen', { exact: true }).click()
      await follow.getByLabel(/^Outcome/).selectOption('pending')
      await follow.getByRole('button', { name: 'Record', exact: true }).click()
      await expect(follow.getByText(/: requested, waiting on the selectmen$/)).toHaveCount(2)
    })

    test('refuses a decision with no votes recorded and stores nothing', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      const section = page.getByRole('region', { name: 'Record the decision' })
      await section.getByLabel('Motion').fill('Approve with the listed conditions')
      await section.getByLabel('Findings of fact').fill('The plan meets the site plan standards.')
      await section.getByRole('button', { name: 'Record decision' }).click()
      await expectRefused(
        section.getByLabel('How each member voted'),
        'Fill in: How each member voted.',
      )
      const rows = await db.rows('select 1 from board_decisions where hearing_id = $1', [hearingId])
      expect(rows).toHaveLength(0)
    })

    test('records the decision after the confirmation', async ({ page, db }) => {
      await page.goto(`/staff/boards/hearings/${hearingId}`)
      const section = page.getByRole('region', { name: 'Record the decision' })
      await section.getByLabel('Outcome').selectOption('approved_with_conditions')
      await section.getByLabel('Motion').fill('Approve with the listed conditions')
      await section.getByLabel('How each member voted').fill(VOTES)
      await section.getByLabel('Findings of fact').fill('The plan meets the site plan standards.')
      await section.getByLabel('Conditions').fill('Before issuance: Submit the final drainage plan')
      await section.getByRole('button', { name: 'Record decision' }).click()
      await confirmWith(page, "Record the board's decision?", 'Record decision')
      await expect
        .poll(
          async () =>
            (await db.rows('select 1 from board_decisions where hearing_id = $1', [hearingId]))
              .length,
        )
        .toBe(1)
      const row = await db.one<{ outcome: string; motion: string }>(
        'select outcome, motion from board_decisions where hearing_id = $1',
        [hearingId],
      )
      expect(row).toEqual({
        outcome: 'approved_with_conditions',
        motion: 'Approve with the listed conditions',
      })
    })
  })

test.describe('hearing page without the capability', () => {
  test.use({ role: 'inspector' })

  test('says the inspector may not work with hearings', async ({ page, db }) => {
    const id = await db.one<{ id: string }>('select id from hearings limit 1')
    await page.goto(`/staff/boards/hearings/${id.id}`)
    await expect(permissionAlert(page)).toHaveText(
      'You do not have permission to work with hearings.',
    )
  })
})
