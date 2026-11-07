import { expect, test } from '../fixtures/test'
import { confirmWith } from './confirm'
import {
  buildAndPublishAgenda,
  meetingWithHearing,
  type PublishedMeeting,
  savePacket,
  sharePacketDocument,
} from './packetSetup'
import { expectRefused } from './refusal'

const DOCUMENT = 'Application SPR-2026-0003, snapshot 1'

test.describe
  .serial('agenda from hearings and the packet gathered from it', () => {
    test.use({ role: 'staff' })
    let meeting: PublishedMeeting

    test('adds the scheduled hearing to the agenda and publishes it to storage', async ({
      page,
      db,
      suffix,
    }) => {
      meeting = await meetingWithHearing(page, db, {
        application: 'Kingfisher Point site plan',
        daysAhead: 600,
        location: `Gather chain room ${suffix}`,
      })
      await buildAndPublishAgenda(page, meeting.meetingId)
      const agenda = await db.one<{ status: string; document_id: string | null }>(
        'select status, document_id from agendas where meeting_id = $1',
        [meeting.meetingId],
      )
      expect(agenda.status).toBe('published')
      expect(agenda.document_id).not.toBeNull()
    })

    test('shares the application snapshot with the board and saves the packet', async ({
      page,
      db,
    }) => {
      await sharePacketDocument(page, meeting.meetingId)
      await savePacket(page, meeting.meetingId, DOCUMENT)
      const items = await db.rows(
        `select 1 from board_packet_items i join board_packets p on p.id = i.packet_id
       where p.meeting_id = $1`,
        [meeting.meetingId],
      )
      expect(items.length).toBeGreaterThan(0)
    })

    test('refuses a blank packet title beside the title field', async ({ page }) => {
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      const review = page.getByRole('region', { name: 'Review' })
      await review.getByLabel(/^Title/).fill('')
      await review.getByRole('button', { name: 'Save title' }).click()
      await expectRefused(review.getByLabel(/^Title/), 'Fill in: Title.')
    })

    test('renames the packet and stores the new title', async ({ page, db, suffix }) => {
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      const review = page.getByRole('region', { name: 'Review' })
      await review.getByLabel(/^Title/).fill(`Gather packet ${suffix}`)
      await review.getByRole('button', { name: 'Save title' }).click()
      await expect(review.getByText('Title saved.')).toBeVisible()
      const row = await db.one<{ title: string }>(
        'select title from board_packets where meeting_id = $1',
        [meeting.meetingId],
      )
      expect(row.title).toBe(`Gather packet ${suffix}`)
    })

    test('reopens the agenda, adds an item, and replaces the agenda in the packet', async ({
      page,
      db,
    }) => {
      await page.goto(`/staff/boards/meetings/${meeting.meetingId}`)
      await page.getByRole('button', { name: 'Reopen the agenda' }).click()
      await confirmWith(
        page,
        'Take the agenda off the board and meetings pages and reopen it?',
        'Reopen the agenda',
      )
      await page.getByText('Add an item', { exact: true }).click()
      await page
        .getByLabel(/^Title/)
        .first()
        .fill('Approval of prior minutes')
      await page.getByRole('button', { name: 'Add item' }).click()
      await expect(page.getByText('Approval of prior minutes')).toBeVisible()
      await page.getByRole('button', { name: 'Show the agenda on the public site' }).click()
      await expect(page.getByText(/Revision 2\./)).toBeVisible()
      await page.getByRole('button', { name: 'Replace the agenda' }).click()
      await expect(page.getByRole('button', { name: 'Replace the agenda' })).toHaveCount(0)
      const agenda = await db.one<{ revision: number }>(
        'select revision from agendas where meeting_id = $1',
        [meeting.meetingId],
      )
      expect(agenda.revision).toBe(2)
    })
  })
