import { expect, test, waitForEmail } from '../fixtures/test'
import { confirmWith } from './confirm'
import { boardIdFor } from './meetings'
import {
  buildAndPublishAgenda,
  meetingWithHearing,
  type PublishedMeeting,
  savePacket,
  sharePacketDocument,
} from './packetSetup'

const MEMBER = 'pb.member@alderpond.example'

test.describe
  .serial('board members read the packet and a cancelled meeting closes it', () => {
    let meeting: PublishedMeeting
    let packetTitle: string

    test.describe('the clerk sends the packet', () => {
      test.use({ role: 'staff' })

      test('prepares and sends a packet to the board', async ({ page, db, suffix }) => {
        meeting = await meetingWithHearing(page, db, {
          application: 'Teal Marsh minor site plan',
          daysAhead: 700,
          location: `Member view room ${suffix}`,
        })
        await buildAndPublishAgenda(page, meeting.meetingId)
        await sharePacketDocument(page, meeting.meetingId)
        await savePacket(page, meeting.meetingId, 'Application MSP-2026-0003, snapshot 1')
        await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
        await page.getByRole('button', { name: /^Send to the .* \(5 members\)$/ }).click()
        await expect
          .poll(async () => {
            const row = await db.one<{ sent_at: string | null }>(
              'select sent_at from board_packets where meeting_id = $1',
              [meeting.meetingId],
            )
            return row.sent_at !== null
          })
          .toBe(true)
        const packet = await db.one<{ short_name: string }>(
          'select b.short_name from board_packets p join boards b on b.id = p.board_id where p.meeting_id = $1',
          [meeting.meetingId],
        )
        packetTitle = `${packet.short_name} packet`
      })
    })

    test.describe('the planning board member', () => {
      test.use({ role: 'planningBoardMember' })

      test('opens the packet from the meeting list and sees no staff forms', async ({ page }) => {
        await page.goto('/board')
        await expect(page.getByRole('heading', { level: 1, name: 'Your board' })).toBeVisible()
        await expect(page.getByText(meeting.spec.location).first()).toBeVisible()
        await page.goto(`/board/meetings/${meeting.meetingId}`)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(packetTitle)
        await expect(page.locator('main form')).toHaveCount(0)
        await expect(page.getByRole('button', { name: /Send|Resend|Save|Turn off/ })).toHaveCount(0)
      })
    })

    test.describe('the zoning board member', () => {
      test.use({ role: 'zbaMember' })

      test('cannot open a planning board packet', async ({ page }) => {
        const response = await page.goto(`/board/meetings/${meeting.meetingId}`)
        expect(response?.status()).toBe(404)
      })
    })

    test.describe('the clerk cancels the meeting', () => {
      test.use({ role: 'staff' })

      test('cancels with the packet recipients told and the board member told by email', async ({
        page,
        db,
      }) => {
        const since = new Date()
        await page.goto(
          `/staff/boards/meetings?board=${await boardIdFor(db, 'planning_board')}&kind=special`,
        )
        const row = page.getByRole('row').filter({ hasText: meeting.spec.location })
        await row.getByText('Cancel', { exact: true }).click()
        await row.getByLabel('Reason').fill('Quorum cannot be reached')
        await row.getByLabel("Email the packet's recipients that the meeting is cancelled").check()
        await row.getByRole('button', { name: 'Cancel meeting' }).click()
        await confirmWith(page, /^Cancel the .* meeting\?$/, 'Cancel the meeting')
        const mail = await waitForEmail({ to: MEMBER, since, subject: 'Meeting cancelled' })
        expect(mail.text).toContain('Quorum cannot be reached')
        const stored = await db.one<{ status: string }>(
          'select status from board_meetings where id = $1',
          [meeting.meetingId],
        )
        expect(stored.status).toBe('cancelled')
      })
    })

    test.describe('the planning board member after the cancellation', () => {
      test.use({ role: 'planningBoardMember' })

      test('no longer opens the packet', async ({ page }) => {
        const response = await page.goto(`/board/meetings/${meeting.meetingId}`)
        expect(response?.status()).toBe(404)
      })
    })
  })
